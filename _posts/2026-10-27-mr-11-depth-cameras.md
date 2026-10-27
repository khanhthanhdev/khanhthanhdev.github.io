---
layout: post
title: "mobile robots from scratch, part 11: depth cameras"
date: 2026-10-27 00:00:00 +0700
description: how a depth camera measures a distance for every pixel, with two cameras, a projected pattern or the time light takes; why stereo needs texture and gets worse with the square of the distance; how pixels become a point cloud; and what a depth camera sees that a 2-D lidar can't
tags: robotics depth-camera sensors interactive
categories: explainer
series: mobile-robots-from-scratch
part: 11
math: true
toc:
  beginning: true
css:
  - /assets/css/screen-works.css
  - /assets/css/transformer.css
  - /assets/css/clustering.css
  - /assets/css/mobile-robot.css
js:
  - /assets/js/mobile-robot/mr-core.js
  - /assets/js/transformer/tf-view.js
  - /assets/js/mobile-robot/mr-view.js
  - /assets/js/mobile-robot/part11.js
  - /assets/js/mobile-robot/mr-scrolly.js
---

{% include mr-series.liquid %}

[Part 8]({% post_url 2026-10-27-mr-8-lidar-how-it-measures %})'s lidar sees one flat slice of the room. Anything above or below that slice, a table top, a step down, a toy on the floor, is invisible to it. A **depth camera** measures a distance for every pixel of an image, so it sees the room in 3-D, at the cost of range and precision.

## Seeing in depth, step by step

<section class="tf-scrolly" data-mr-scene="part11">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="image" data-title="A picture of distances." markdown="1">
**A depth image looks like a photo, but each pixel holds a distance** instead of a colour: how far the surface seen by that pixel is, along the camera's axis. Here, near is orange and far is blue.

This camera is 30 cm above the floor on the robot of part 1, looking straight ahead, with an 87° wide view. Its image is small, 96 × 60 pixels, so each pixel is visible; real ones have about 640 × 480 or more. The pixel in the centre sees the box, 1.60 m away. At the bottom is the floor, from 51 cm in front of the robot; nearer than that is out of view.

About a fifth of the 5,760 pixels have no reading: the wall at the far end, beyond the camera's 6 m range. Depth cameras see less far than lidars.

</div>

<div class="tf-step" data-step="stereo" data-title="Two cameras: depth from disparity." markdown="1">
**The most common depth camera is two cameras side by side**, like two eyes. A point near the camera appears in quite different places in the left and right images; a far one, in nearly the same place. That shift, the **disparity** $$d$$, gives the depth, by the same triangle as part 8's triangulation lidar:

$$z = \frac{f\,b}{d}.$$

With images 848 pixels wide, $$f$$ is 447 pixels. With a **baseline** $$b$$ of 5 cm, the box at 1.60 m shifts by 14 pixels.

And it has the same weakness: error grows with the square of the distance. If the shift is found to a tenth of a pixel, the error is 0.45 cm at 1 m and 7.2 cm at 4 m. A wider baseline helps: 3.8 cm at 4 m with 9.5 cm between the cameras, 3.0 cm with 12 cm. That's why cameras made for longer range are wider.

</div>

<div class="tf-step" data-step="match" data-title="Matching needs texture." markdown="1">
**To find the disparity**, the camera takes a small window around each pixel of the left image and slides it along the same row of the right image, looking for where it matches best. Here the window is 15 pixels wide.

On a **patterned** surface, one shift matches far better than any other: 14 pixels, the right answer, with the next best 3.6 times worse. Switch to a **plain wall**. Every shift looks the same, and the best is only 3% better than the rest: it picks 27 pixels, which would put the wall at 0.83 m instead of 1.60 m. Plain walls are exactly what rooms are made of.

The fix is **active stereo**: a small projector covers the scene in random infrared dots, invisible to people, which give every surface a texture. With the projector on, the plain wall matches at 14 pixels again, 4 times better than the next best. The same projector, in daylight outdoors, is drowned out by the sun, but outdoor scenes usually have texture of their own.

</div>

<div class="tf-step" data-step="cloud" data-title="From pixels to points." markdown="1">
**Each pixel with a depth is a point in 3-D.** Pixel $$(u, v)$$ at depth $$z$$ is at

$$x = \frac{(u - c_x)\,z}{f}, \qquad y = \frac{(v - c_y)\,z}{f}$$

in the camera's frame, with $$(c_x, c_y)$$ the centre of the image. Then the camera's pose on the robot, and the robot's in the room, place it in the world, as for a lidar scan. The result is a **point cloud**: here about 4,650 points, seen from above.

Most points are floor (grey, about 2,300) or too high to matter (blue, about 1,500: the upper walls, the pillar). The 844 in red are between 3 cm and 50 cm above the floor: in the robot's way.

</div>

<div class="tf-step" data-step="low" data-title="What the lidar misses." markdown="1">
**On the floor in front of the robot is a toy**, 8 cm high. The lidar's beam is 20 cm up, so it passes over the toy: none of its points (green) are on it. To the lidar, and to any map built from it, the path is clear.

The depth camera puts 59 points on the toy. A navigation stack keeps these in its costmap (part 15) as obstacles, alongside the lidar's. Tables are the same problem from the other side: a lidar sees only their legs, while the top, at the height of the robot's head, is what it would hit.

This is why most robots carry both: the lidar for long range and for localising, where one precise slice is enough; the depth camera for what's near and not in that slice.

</div>

  </div>
</section>

## Three ways to measure depth

- **Passive stereo**: two cameras, no light of their own. Works outdoors and at range, given texture; fails on plain surfaces and in the dark.
- **Active stereo**: two cameras and a dot projector. Works on plain walls indoors; outdoors it becomes passive stereo.
- **Structured light**: one camera and a projector of a known pattern. The camera sees how the pattern is shifted, which is triangulation with the projector in place of the second camera. The original Kinect worked this way. Precise up close, but the pattern fades with distance and in sunlight.
- **Time of flight**: part 8's phase-shift method, measured for every pixel of a special sensor at once. Its error grows more slowly with distance, and it doesn't need texture. But light bouncing off two surfaces before returning (**multipath**) makes corners read too far, and bright sunlight swamps it.

## Cameras you'll meet

As of October 2026, from the makers' specifications:

{: .tf-table}
| camera | method | baseline or range |
| ---------------- | ------------ | ----------------- |
| RealSense D435i | active stereo | 5 cm baseline |
| RealSense D455 | active stereo | 9.5 cm baseline |
| Stereolabs ZED 2i | passive stereo | 12 cm baseline |
| Orbbec Femto Bolt | time of flight | 0.25 to 5.5 m |

RealSense was spun out of Intel as its own company in 2025. Most have an IMU and a colour camera built in, and all have ROS 2 drivers that publish the depth image, the colour image and the point cloud.

## What's still missing

- **Fusing everything.** The robot now has wheels, an IMU, a lidar and a depth camera, each with its own errors. Combining them is [part 12]({% post_url 2026-10-27-mr-12-kalman-filters %}).
- **Using the points.** How obstacles from both sensors go into one costmap is [part 15]({% post_url 2026-10-27-mr-15-path-planning-and-navigation %}).

## Going deeper

### Calibration

Every number above assumes the camera's **intrinsics** (the focal length $$f$$ and centre $$(c_x, c_y)$$, and the lens's distortion) and, for stereo, the exact pose of one camera relative to the other. They're measured by photographing a checkerboard from many angles, and makers calibrate at the factory. A stereo camera that's been dropped can lose depth accuracy because its two cameras have moved by a fraction of a millimetre. The camera's pose on the robot, its **extrinsics** (the `base_link` → `camera_link` transform), must be measured too: a 1° error in its tilt puts a point 4 m away 7 cm too high or low, enough to see the floor as an obstacle.

### Flying pixels

At the edge of an object, a pixel sees partly the object and partly the wall behind it. Stereo matching and time of flight both tend to report a depth somewhere in between, so the cloud gets a trail of points floating in mid-air along every edge. Filters drop points whose depth differs a lot from their neighbours'.

### Learned depth

Neural networks can estimate depth from a single colour image, or improve a stereo camera's depth where matching fails. Modern stereo networks give dense, clean depth even on plain surfaces, and run on a Jetson (part 7). They can be confidently wrong, though, on things unlike what they were trained on, so robots still treat their output with care.

## Further reading

- D. Scharstein and R. Szeliski, [_A taxonomy and evaluation of dense two-frame stereo correspondence algorithms_](https://doi.org/10.1023/A:1014573219977) (IJCV 2002): how stereo matching works, and how to compare matchers.
- L. Keselman et al., [_Intel RealSense stereoscopic depth cameras_](https://doi.org/10.1109/CVPRW.2017.167) (CVPR workshops 2017): the design of an active stereo camera, and its error.
- M. Hansard et al., [_Time-of-flight cameras: principles, methods and applications_](https://doi.org/10.1007/978-1-4471-4658-2) (Springer, 2013): how ToF cameras work, and multipath.
- Stereolabs, [_ZED 2i_](https://www.stereolabs.com/en-sg/store/products/zed-2i): a passive stereo camera's specifications.

{% include mr-series.liquid %}
