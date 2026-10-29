// Part 10 of the diffusion series: latent diffusion (Rombach et al., 2022). One scene: 16 × 16 pictures whose only
// content is a dot on the Swiss roll, noise in pixel space against noise in a 2-number latent space, an autoencoder
// (written by hand here, trained in the paper), diffusion in the latent space with the network from parts 1–4,
// cross-attention, and the Stable Diffusion pipeline. Every number on the toy comes from DM.
(function () {
  "use strict";

  const DM = window.DM;
  const { s, fmt } = window.TF.view;
  const { plot, chart, at, chunked, sub } = DM.view;
  DM.scenes = DM.scenes || {};

  const P = 16; // pixels per side
  const R = 2.6; // the latent square [−R, R]² fills the picture, with a margin
  const RAD = 1.3; // the dot's radius in pixels
  const N = 600;
  const SHOW = 12; // pictures in the album
  const narrow = window.matchMedia("(max-width: 991.98px)");
  const beside = (x, y, opts) => (narrow.matches ? [0, 450, opts] : [x, y, opts]);

  /* ---------------------------------------------------------------- the autoencoder, by hand */

  const toPix = (z) => 1.5 + ((z + R) / (2 * R)) * (P - 4);
  const fromPix = (p) => ((p - 1.5) / (P - 4)) * 2 * R - R;
  // decoder: a latent (x, y) becomes a 16 × 16 picture of a soft dot at that place, pixels in [−1, 1]
  function decode(zx, zy) {
    const v = new Float64Array(P * P);
    const cx = toPix(zx);
    const cy = toPix(-zy);
    for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) v[j * P + i] = -1 + 2 * Math.exp(-((i - cx) ** 2 + (j - cy) ** 2) / (2 * RAD * RAD));
    return v;
  }
  // encoder: the dot's centre of mass, weighting bright pixels heavily, back in latent units
  function encode(v) {
    let sw = 0;
    let sx = 0;
    let sy = 0;
    for (let j = 0; j < P; j++)
      for (let i = 0; i < P; i++) {
        const w = Math.max(0, (v[j * P + i] + 1) / 2) ** 4;
        sw += w;
        sx += w * i;
        sy += w * j;
      }
    return [fromPix(sx / sw), -fromPix(sy / sw)];
  }

  /* ---------------------------------------------------------------- an album of small pictures */

  // Pictures drawn as <image> elements from a canvas, scaled up with crisp pixels. They are photos, not charts: the
  // greys are the same in both themes.
  function album(parent, cols, rows, size = 72, gap = 10) {
    const g = s("g", { class: "dm-album tf-obj" });
    const title = s("text", { class: "tf-mat-title", x: 0, y: -12, text: "" });
    const canvas = document.createElement("canvas");
    canvas.width = P;
    canvas.height = P;
    const ctx = canvas.getContext("2d");
    const imgs = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x = c * (size + gap);
        const y = r * (size + gap);
        g.append(s("rect", { class: "dm-frame", x: x - 1, y: y - 1, width: size + 2, height: size + 2 }));
        const im = s("image", { x, y, width: size, height: size, class: "dm-pixels" });
        imgs.push(im);
        g.append(im);
      }
    g.append(title);
    parent.append(g);
    const W = cols * (size + gap) - gap;
    const H = rows * (size + gap) - gap;
    const api = {
      el: g,
      box: { x: -4, y: -30, width: W + 8, height: H + 34 },
      title(text) {
        title.textContent = text || "";
        return api;
      },
      set(pictures) {
        imgs.forEach((im, k) => {
          const v = pictures[k];
          if (!v) return im.setAttribute("href", "");
          const data = ctx.createImageData(P, P);
          for (let i = 0; i < P * P; i++) {
            const g8 = Math.round(127.5 * (Math.max(-1, Math.min(1, v[i])) + 1));
            data.data[4 * i] = data.data[4 * i + 1] = data.data[4 * i + 2] = g8;
            data.data[4 * i + 3] = 255;
          }
          ctx.putImageData(data, 0, 0);
          im.setAttribute("href", canvas.toDataURL());
        });
        return api;
      },
    };
    return api;
  }

  /* ---------------------------------------------------------------- cross-attention, with hand-made vectors */

  // Image positions on a 6 × 6 grid ask questions (queries); prompt words answer (keys). Each position's attention
  // over the words is a softmax of query · key / √d. The vectors are made by hand to show the mechanism; a real model
  // learns them, in hundreds of dimensions.
  const WORDS = ["a", "dot", "near", "the", "top", "left"];
  const KEYS = {
    a: [0, 0, 0, 0, 0.5],
    dot: [0, 0, 0, 0, 4],
    near: [0, 0, 0, 0, 0.5],
    the: [0, 0, 0, 0, 0.5],
    top: [0, 6, 0, 0, 0],
    left: [0, 0, 6, 0, 0],
  };
  const query = (x, y) => [x, y, 1 - x, 1 - y, 0.6]; // from the position's features
  function attention(x, y) {
    const q = query(x, y);
    const sc = WORDS.map((w) => KEYS[w].reduce((sum, k, i) => sum + k * q[i], 0) / Math.sqrt(q.length));
    const top = Math.max(...sc);
    const e = sc.map((v) => Math.exp(v - top));
    const z = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / z);
  }

  function attnGrid(parent) {
    const n = 6;
    const cell = 46;
    const g = s("g", { class: "dm-attn tf-obj" });
    const title = s("text", { class: "tf-mat-title", x: 0, y: -12, text: "" });
    const rects = [];
    const labels = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const r = s("rect", { class: "dm-attn-cell", x: i * cell, y: j * cell, width: cell - 2, height: cell - 2 });
        const t = s("text", { class: "tf-small dm-attn-num", x: i * cell + cell / 2 - 1, y: j * cell + cell / 2 + 3, "text-anchor": "middle" });
        rects.push(r);
        labels.push(t);
      }
    g.append(...rects, ...labels, title);
    parent.append(g);
    return {
      el: g,
      box: { x: -4, y: -30, width: n * cell + 8, height: n * cell + 34 },
      show(word) {
        const wi = WORDS.indexOf(word);
        title.textContent = `how much each position attends to "${word}"`;
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            const a = attention(i / (n - 1), 1 - j / (n - 1))[wi];
            rects[j * n + i].style.fillOpacity = String(0.08 + 0.92 * a);
            labels[j * n + i].textContent = fmt(a, 2);
          }
      },
    };
  }

  /* ---------------------------------------------------------------- the Stable Diffusion pipeline */

  function pipeline(parent) {
    const g = s("g", { class: "dm-unet tf-obj" });
    const items = [];
    const boxAt = (x, y, w, h, a, b) => {
      items.push(s("rect", { class: "dm-unet-box", x, y, width: w, height: h, rx: 4 }));
      items.push(s("text", { class: "dm-unet-text", x: x + w / 2, y: y + 19, "text-anchor": "middle", text: a }));
      if (b) items.push(s("text", { class: "dm-unet-sub", x: x + w / 2, y: y + 35, "text-anchor": "middle", text: b }));
    };
    const arrow = (x1, y1, x2, y2) => items.push(s("path", { class: "dm-unet-arrow", d: `M${x1} ${y1}L${x2} ${y2}` }));
    boxAt(0, 0, 200, 46, "prompt", "“a corgi in a top hat”");
    boxAt(0, 80, 200, 46, "text encoder (CLIP)", "77 tokens × 768 numbers");
    boxAt(260, 0, 240, 46, "noise in the latent space", "64 × 64 × 4");
    boxAt(260, 80, 240, 74, "U-Net in the latent space", "cross-attention to the tokens");
    items.push(s("text", { class: "dm-unet-sub", x: 380, y: 135, "text-anchor": "middle", text: "classifier-free guidance, ~50 steps" }));
    boxAt(260, 190, 240, 46, "denoised latent", "64 × 64 × 4");
    boxAt(260, 270, 240, 46, "decoder (the autoencoder's)", "upsamples by 8 in each direction");
    boxAt(260, 350, 240, 46, "picture", "512 × 512 × 3");
    arrow(100, 46, 100, 80);
    arrow(200, 103, 260, 117);
    arrow(380, 46, 380, 80);
    arrow(380, 154, 380, 190);
    arrow(380, 236, 380, 270);
    arrow(380, 316, 380, 350);
    g.append(...items);
    parent.append(g);
    return { el: g, box: { x: -10, y: -10, width: 520, height: 420 } };
  }

  /* ---------------------------------------------------------------- the scene */

  DM.scenes.part10 = function (stage) {
    const { svg, strip } = stage;
    const data = DM.DATASETS.swissroll;
    const sch = DM.schedule("linear", 200);
    const net = DM.netModel(DM.loadNet("swissroll-eps"), sch);
    const z0 = DM.sample(data, N, 1).xs;
    const pics = Array.from({ length: SHOW }, (_, i) => decode(z0[2 * i], z0[2 * i + 1]));
    const pixNoise = Array.from({ length: SHOW }, (_, i) => DM.gaussian((P * P) / 2, 100 + i));
    const latNoise = DM.gaussian(SHOW, 7);
    const floor = DM.dataFloor(data, N);

    const main = plot(svg, { range: 3 });
    const pics1 = album(svg, 4, 3);
    const pics2 = album(svg, 4, 3);
    const attn = attnGrid(svg);
    const pipe = pipeline(svg);
    const layout = DM.layout(svg, () => ({ main, pics1, pics2, attn, pipe }));

    let run = null;
    stage.busy("sampling in the latent space…");
    const st = DM.ddpmStepper(net, sch, DM.gaussian(N, 2), { seed: 42 });
    chunked(
      () => st.next(8),
      null,
      () => {
        run = st.frames;
        stage.busy(null);
        stage.note(`16 × 16 pictures · latent space of 2 numbers · the part 4 network, unchanged`);
        stage.redraw();
      }
    );

    function reset() {
      main.view(3).shade(null).rings([]).arrows([]).marks([]).paths([]).corner("").cloud("b", null).cloud("pts", null);
    }

    function render(step, t) {
      reset();

      if (step === "pictures") {
        pics1.title("12 pictures from the data").set(pics);
        strip(`each picture is ${P * P} numbers (pixels in [−1, 1]) · all ${P * P} are set by just two: where the dot is`);
        layout({ pics1: [0, 0] });
        return;
      }

      if (step === "pixel") {
        const k = Math.round(t * 200);
        const a = Math.sqrt(sch.alphaBar[k]);
        const b = Math.sqrt(1 - sch.alphaBar[k]);
        pics1.title(`noised in pixel space, t = ${k}`).set(pics.map((v, i) => v.map((p, j) => a * p + b * pixNoise[i][j])));
        pics2
          .title(`noised in the latent space, then decoded, t = ${k}`)
          .set(pics.map((_, i) => decode(a * z0[2 * i] + b * latNoise[2 * i], a * z0[2 * i + 1] + b * latNoise[2 * i + 1])));
        strip(
          `the same forward process, x_t = √ᾱ·x₀ + √(1 − ᾱ)·ε, on ${P * P} pixels (left) or on 2 latent numbers (right) · ᾱ_t = ${fmt(sch.alphaBar[k], 3)}`
        );
        if (narrow.matches) layout({ pics1: [0, 0, { scale: 0.9 }], pics2: [0, 280, { scale: 0.9 }] });
        else layout({ pics1: [0, 0], pics2: [340, 0] });
        return;
      }

      if (step === "encode") {
        // encode every data picture: the codes are the Swiss roll
        const codes = new Float64Array(2 * N);
        let err = 0;
        for (let i = 0; i < N; i++) {
          const c = encode(decode(z0[2 * i], z0[2 * i + 1]));
          codes[2 * i] = c[0];
          codes[2 * i + 1] = c[1];
          err += Math.hypot(c[0] - z0[2 * i], c[1] - z0[2 * i + 1]);
        }
        main.title(`the codes of ${N} pictures`).cloud("pts", codes, "dm-data");
        pics1.title("pictures").set(pics);
        strip(
          `encoder: the dot's centre of mass · decoder: draw a dot there · ${P * P} numbers in, 2 out, 2 in, ${P * P} out · average error after encoding and decoding ${fmt(err / N, 4)} in latent units`
        );
        if (narrow.matches) layout({ pics1: [0, 0, { scale: 0.9 }], main: [0, 280, { scale: 0.75 }] });
        else layout({ pics1: [0, 40], main: [360, 0, { scale: 0.85 }] });
        return;
      }

      if (step === "latent" || step === "decoded") {
        if (!run) {
          main.title("sampling…");
          strip("sampling…");
          layout({ main: [0, 0] });
          return;
        }
        const k = step === "decoded" ? 0 : Math.round((1 - t) * 200);
        main.title(`latent diffusion: z${sub(k)}`).cloud("pts", run[k], step === "decoded" ? "dm-model is-strong" : "dm-model");
        if (step === "decoded") main.cloud("b", z0, "dm-data is-faint");
        pics1
          .title(step === "decoded" ? "decoded samples" : `decoded, t = ${k}`)
          .set(Array.from({ length: SHOW }, (_, i) => decode(...at(run[k], i))));
        strip(
          step === "decoded"
            ? `12 of ${N} samples, decoded · distance of the latent samples to the true spiral ${fmt(DM.slicedToData(run[0], data), 3)} (real codes: ${fmt(floor, 3)}) · every decoded picture is a clean dot, at every step`
            : `the network denoises 2 numbers per step, not ${P * P} · t = ${k}`
        );
        if (narrow.matches) layout({ pics1: [0, 0, { scale: 0.9 }], main: [0, 280, { scale: 0.75 }] });
        else layout({ pics1: [0, 40], main: [360, 0, { scale: 0.85 }] });
        return;
      }

      if (step === "attention") {
        const word = WORDS[Math.min(WORDS.length - 1, Math.floor(t * WORDS.length))];
        attn.show(word);
        strip(
          `attention = softmax(Q·Kᵀ/√d) · queries from each image position, keys and values from the prompt's tokens · each position's weights over the ${WORDS.length} words add up to 1 · hand-made vectors`
        );
        layout({ attn: [0, 0] });
        return;
      }

      if (step === "pipeline") {
        strip("Stable Diffusion v1: a 512 × 512 picture is generated as a 64 × 64 × 4 latent, 48 times fewer numbers, then decoded");
        layout({ pipe: [0, 0] });
      }
    }

    return { render };
  };
})();
