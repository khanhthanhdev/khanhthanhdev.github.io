# NexArm project media

- `thumbnail.jpg`: project card image
- `workspace-setup.jpg`: assembled workstation
- `cad-workspace-fusion360.jpg` and `gantry-rig-cad-render.png`: gantry design
- `wrist-camera-mount.jpg`: wrist camera bracket
- `robotics-lab-team.jpg`: project team
- `teleop-poster.webp`: preview frame for the teleoperation video

The demonstration videos are in `assets/video/`.

## Video quality and size

Always export from the original recording, not an already compressed website copy. Keep originals outside this repository.

The teleoperation clip retains its original 720×1280 resolution at 30 fps, using H.264 for browser compatibility. Its approximately 4.4 MB size preserves robot and gripper detail; forcing this 23-second clip below 500 KB caused severe compression artifacts. The article limits the portrait player to 420 CSS pixels, uses a small poster, and sets `preload="none"` so the video is downloaded only when played.

To reproduce the exports, set `TELEOP_SOURCE` to the original `video_2026-10-11_10-55-41.mp4` and `DEPTH_SOURCE` to `Screencast from 2026-10-07 18-10-34.mp4`, then run from the repository root:

```bash
ffmpeg -i "$TELEOP_SOURCE" -map 0:v:0 -map '0:a:0?' -vf fps=30 \
  -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p \
  -c:a aac -b:a 64k -movflags +faststart assets/video/teleop-demonstration.mp4

ffmpeg -ss 6 -i "$TELEOP_SOURCE" -frames:v 1 -c:v libwebp -quality 82 \
  assets/img/projects/6dof-robot/teleop-poster.webp

# The depth recording is already efficient H.264: preserve its quality without re-encoding.
ffmpeg -i "$DEPTH_SOURCE" -map 0:v:0 -c:v copy -an -movflags +faststart \
  assets/video/realsense-depth-rgb-stream.mp4
```

The depth clip retains its native 684×924 resolution and is stored for reference; it is not currently embedded in the article. If longer recordings exceed the hosting provider's per-file limit, use external video hosting rather than reducing the bitrate until details disappear.
