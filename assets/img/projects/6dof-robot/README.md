# NexArm project media

- `setup_1.jpg`: optimized workstation photo (1600×1056), used for both the project card and workspace section
- `thumbnail.jpg` and `workspace-setup.jpg`: copies of the same optimized photo for existing references
- `cad-workspace-fusion360.jpg` and `gantry-rig-cad-render.png`: gantry design
- `wrist-camera-mount.jpg`: wrist camera bracket
- `robotics-lab-team.jpg`: project team
- `teleop-poster.webp`: preview frame for the teleoperation video
- `policy-rollout-poster.webp`: preview frame for the policy rollout video
- `20261030_162831.jpg`: additional project photo, resized to 1600×1200

The demonstration videos are in `assets/video/`.

- `20261118_172224.mp4`: policy rollout demo embedded in the article, exported as 720×1280 H.264 at 30 fps with AAC audio and fast start for web playback.
- `realsense-depth-rgb-stream.mp4`: depth recording; `VID_20261007_181306_124.mp4` contained the same encoded video stream and has been removed from the image folder.

For new video embeds, use `controls`, `playsinline`, and `preload="none"` so the page does not download the recording before playback. The additional photo is available for future use; the policy rollout video is embedded in the article.

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

# Export the additional recording from its original source.
ffmpeg -i "$RECORDING_SOURCE" -map 0:v:0 -map '0:a:0?' \
  -vf "scale=720:-2,fps=30" -c:v libx264 -preset slow -crf 26 \
  -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart \
  assets/video/20261118_172224.mp4

# The depth recording is already efficient H.264: preserve its quality without re-encoding.
ffmpeg -i "$DEPTH_SOURCE" -map 0:v:0 -c:v copy -an -movflags +faststart \
  assets/video/realsense-depth-rgb-stream.mp4
```

The depth clip retains its native 684×924 resolution and is stored for reference; it is not currently embedded in the article. If longer recordings exceed the hosting provider's per-file limit, use external video hosting rather than reducing the bitrate until details disappear.
