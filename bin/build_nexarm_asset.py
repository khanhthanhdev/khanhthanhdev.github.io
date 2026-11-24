#!/usr/bin/env python3
"""Convert the NexArm MJCF and its STL meshes into the web asset used by /works/robot-policy/.

The output is a pair of files:

  nexarm.json  body tree (positions, quaternions, joints, geoms, sites, cameras), the bowl-stacking
               scene (workcell boxes, bowls, fixed cameras) and, for each mesh, its byte offsets
               and quantization parameters.
  nexarm.bin.gz  one gzipped binary blob: int16 positions, int8 normals and uint16/uint32 indices per mesh.
               Gzipped here because hosts do not compress application/octet-stream; the browser inflates it
               with DecompressionStream.
  table_oak.webp  the oak tabletop texture of the simulated (and real) workcell.

Positions are stored relative to each mesh's bounding box and decoded in the browser as
`(q + 32768) * scale[axis] + min[axis]`. Normals are split at creases so CAD edges stay sharp.

Usage (from the repository root, with a checkout of khanhthanhdev/lerobot-nexarm whose LFS meshes
are present):

  pip install numpy fast-simplification pillow
  python3 bin/build_nexarm_asset.py --nexarm ../lerobot-nexarm --out assets/robot/nexarm
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import struct
import xml.etree.ElementTree as ET
from pathlib import Path

import fast_simplification
import numpy as np
from PIL import Image

TABLE_TEXTURE_PX = 512
CREASE_DEG = 38.0
# Fraction of faces kept per mesh; meshes not listed keep every face. The CAD STLs are thin, non-manifold
# shells, and decimating them much harder tears holes and spikes into the links (checked against MuJoCo renders).
KEEP_RATIO_BY_MESH = {"link_1": 0.5, "link_3": 0.5, "link_4": 0.7, "link_5": 0.7, "bowl": 0.3}


def floats(text: str | None, default: list[float] | None = None) -> list[float] | None:
    if text is None:
        return default
    return [float(v) for v in text.split()]


def read_stl(path: Path) -> np.ndarray:
    data = path.read_bytes()
    if data[:5] == b"solid" and b"facet" in data[:400]:
        raise ValueError(f"{path} is an ASCII STL; only binary STL is supported")
    if data.startswith(b"version https://git-lfs"):
        raise ValueError(f"{path} is a Git LFS pointer; fetch the real mesh first")
    (count,) = struct.unpack_from("<I", data, 80)
    rec = np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("attr", "<u2")])
    tris = np.frombuffer(data, dtype=rec, count=count, offset=84)
    return tris["v"].astype(np.float64)  # [F, 3, 3]


def weld(tris: np.ndarray, scale: float) -> tuple[np.ndarray, np.ndarray]:
    flat = tris.reshape(-1, 3) * scale
    key = np.round(flat / 1e-6).astype(np.int64)
    _, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
    faces = inverse.reshape(-1, 3)
    faces = faces[(faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])]
    return flat[first], faces


def decimate(points: np.ndarray, faces: np.ndarray, keep: float) -> tuple[np.ndarray, np.ndarray]:
    if keep >= 1.0:
        return points, faces
    p, f = fast_simplification.simplify(points.astype(np.float32), faces.astype(np.int32), 1 - keep)
    return p.astype(np.float64), f.astype(np.int64)


def crease_normals(points: np.ndarray, faces: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return per-corner positions/normals welded where adjacent faces are within CREASE_DEG."""
    a, b, c = (points[faces[:, i]] for i in range(3))
    fn = np.cross(b - a, c - a)  # area-weighted
    unit = fn / np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-20)
    cos_lim = math.cos(math.radians(CREASE_DEG))

    corners_of: dict[int, list[int]] = {}
    for fi, tri in enumerate(faces):
        for v in tri:
            corners_of.setdefault(int(v), []).append(fi)

    out_pos: list[np.ndarray] = []
    out_nrm: list[np.ndarray] = []
    lookup: dict[tuple[int, int, int, int], int] = {}
    new_faces = np.empty_like(faces)
    for fi, tri in enumerate(faces):
        for k, v in enumerate(tri):
            group = corners_of[int(v)]
            mask = unit[group] @ unit[fi] > cos_lim
            n = fn[group][mask].sum(axis=0)
            n /= max(np.linalg.norm(n), 1e-20)
            q = tuple(np.round(n * 127).astype(int))
            key = (int(v), *q)
            idx = lookup.get(key)
            if idx is None:
                idx = len(out_pos)
                lookup[key] = idx
                out_pos.append(points[v])
                out_nrm.append(n)
            new_faces[fi, k] = idx
    return np.array(out_pos), np.array(out_nrm), new_faces


class BinWriter:
    def __init__(self) -> None:
        self.buf = bytearray()

    def add(self, arr: np.ndarray) -> int:
        while len(self.buf) % 4:
            self.buf.append(0)
        offset = len(self.buf)
        self.buf += arr.tobytes()
        return offset


def encode_mesh(name: str, path: Path, scale: float, out: BinWriter) -> dict:
    points, faces = weld(read_stl(path), scale)
    points, faces = decimate(points, faces, KEEP_RATIO_BY_MESH.get(name, 1.0))
    pos, nrm, faces = crease_normals(points, faces)
    lo, hi = pos.min(axis=0), pos.max(axis=0)
    step = np.maximum(hi - lo, 1e-9) / 65535.0
    q = (np.round((pos - lo) / step) - 32768).clip(-32768, 32767).astype("<i2")
    n = np.round(nrm * 127).clip(-127, 127).astype("i1")
    wide = len(pos) > 65535
    idx = faces.astype("<u4" if wide else "<u2").reshape(-1)
    entry = {
        "vertexCount": int(len(pos)),
        "indexCount": int(len(idx)),
        "wideIndex": wide,
        "min": [round(float(v), 7) for v in lo],
        "scale": [float(f"{v:.6e}") for v in step],
        "position": {"offset": out.add(q)},
        "normal": {"offset": out.add(n)},
        "index": {"offset": out.add(idx)},
    }
    print(f"  {name:22s} {len(faces):6d} tris  {len(pos):6d} verts")
    return entry


def parse_body(el: ET.Element) -> dict:
    body = {
        "name": el.get("name"),
        "pos": floats(el.get("pos"), [0, 0, 0]),
        "quat": floats(el.get("quat"), [1, 0, 0, 0]),
        "joint": None,
        "geoms": [],
        "sites": [],
        "cameras": [],
        "children": [],
    }
    for child in el:
        if child.tag == "joint":
            body["joint"] = {
                "name": child.get("name"),
                "type": child.get("type", "hinge"),
                "pos": floats(child.get("pos"), [0, 0, 0]),
                "axis": floats(child.get("axis"), [0, 0, 1]),
                "range": floats(child.get("range")),
            }
        elif child.tag == "geom" and child.get("mesh") and child.get("class") == "visual":
            body["geoms"].append({"mesh": child.get("mesh"), "material": child.get("material")})
        elif child.tag == "site":
            body["sites"].append({"name": child.get("name"), "pos": floats(child.get("pos"))})
        elif child.tag == "camera":
            body["cameras"].append(
                {"name": child.get("name"), "pos": floats(child.get("pos")), "xyaxes": floats(child.get("xyaxes")), "fovy": float(child.get("fovy", 45))}
            )
        elif child.tag == "body":
            body["children"].append(parse_body(child))
    return body


def rgba_of(root: ET.Element) -> dict[str, list[float]]:
    return {m.get("name"): floats(m.get("rgba")) for m in root.iter("material") if m.get("rgba")}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--nexarm", type=Path, required=True, help="checkout of khanhthanhdev/lerobot-nexarm")
    ap.add_argument("--meshes", type=Path, help="override the STL directory (defaults to sim/assets/meshes/visual)")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    mjcf_dir = args.nexarm / "sim/description/mjcf"
    mesh_dir = args.meshes or args.nexarm / "sim/assets/meshes/visual"
    arm = ET.parse(mjcf_dir / "nexarm.xml").getroot()
    scene = ET.parse(mjcf_dir / "bowl_stack_scene.xml").getroot()
    workcell = ET.parse(mjcf_dir / "workcell.xml").getroot()

    materials = {**rgba_of(arm), **rgba_of(scene), **rgba_of(workcell)}
    out = BinWriter()
    meshes = {}
    print("meshes:")
    for m in [*arm.iter("mesh"), *scene.iter("mesh")]:
        s = floats(m.get("scale"), [1, 1, 1])[0]
        meshes[m.get("name")] = encode_mesh(m.get("name"), mesh_dir / m.get("file"), s, out)

    root_body = parse_body(arm.find("worldbody/body"))

    cameras = [
        {"name": c.get("name"), "pos": floats(c.get("pos")), "xyaxes": floats(c.get("xyaxes")), "fovy": float(c.get("fovy", 45))}
        for c in scene.find("worldbody").findall("camera")
    ]
    bowls = []
    for b in scene.find("worldbody").findall("body"):
        if b.get("name", "").startswith("bowl_"):
            vis = next(g for g in b.findall("geom") if g.get("mesh"))
            bowls.append({"name": b.get("name"), "pos": floats(b.get("pos")), "mesh": vis.get("mesh"), "material": vis.get("material")})
    boxes = [
        {"pos": floats(g.get("pos")), "size": floats(g.get("size")), "material": g.get("material")}
        for g in workcell.iter("geom")
        if g.get("type") == "box"
    ]

    # The oak tabletop: the floor plane's material, its texture (re-encoded as WebP) and the cable grommet.
    args.out.mkdir(parents=True, exist_ok=True)
    world = scene.find("worldbody")
    table_mat = next(m for m in scene.iter("material") if m.get("name") == "table")
    texture = next(t for t in scene.iter("texture") if t.get("name") == table_mat.get("texture"))
    image = Image.open(mjcf_dir / texture.get("file")).convert("RGB")
    image.thumbnail((TABLE_TEXTURE_PX, TABLE_TEXTURE_PX))
    image.save(args.out / "table_oak.webp", quality=82, method=6)
    floor = next(g for g in world.findall("geom") if g.get("type") == "plane")
    table = {
        "size": floats(floor.get("size"))[:2],
        "material": table_mat.get("name"),
        "texture": "table_oak.webp",
        "texrepeat": floats(table_mat.get("texrepeat"), [1, 1]),
    }
    cylinders = [
        {"pos": floats(g.get("pos")), "size": floats(g.get("size")), "material": g.get("material")}
        for g in world.findall("geom")
        if g.get("type") == "cylinder"
    ]
    lights = [
        {
            "name": light.get("name"),
            "type": light.get("type", "spot"),
            "pos": floats(light.get("pos")),
            "dir": floats(light.get("dir"), [0, 0, -1]),
            "diffuse": floats(light.get("diffuse"), [0.7, 0.7, 0.7]),
            "cutoff": float(light.get("cutoff", 45)),
            "castshadow": light.get("castshadow", "true") == "true",
        }
        for light in world.findall("light")
    ]

    asset = {
        "source": "khanhthanhdev/lerobot-nexarm sim/description/mjcf (nexarm.xml, bowl_stack_scene.xml, workcell.xml); "
        "visual meshes decimated and quantized by bin/build_nexarm_asset.py",
        "materials": materials,
        "meshes": meshes,
        "robot": root_body,
        "scene": {
            "cameras": cameras,
            "bowls": bowls,
            "boxes": boxes,
            "table": table,
            "cylinders": cylinders,
            "lights": lights,
        },
    }
    (args.out / "nexarm.bin.gz").write_bytes(gzip.compress(bytes(out.buf), 9, mtime=0))
    (args.out / "nexarm.bin").unlink(missing_ok=True)
    (args.out / "nexarm.json").write_text(json.dumps(asset, separators=(",", ":")))
    tris = sum(m["indexCount"] for m in meshes.values()) // 3
    print(f"wrote {args.out}/nexarm.json + nexarm.bin.gz ({len(out.buf) / 1024:.0f} KB raw, {tris} triangles)")


if __name__ == "__main__":
    main()
