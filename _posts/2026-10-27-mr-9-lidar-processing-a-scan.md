---
layout: post
title: "mobile robots from scratch, part 9: lidar, processing a scan"
date: 2026-10-27 00:00:00 +0700
description: what a robot does with a lidar scan, from a list of ranges to points, removing the smear a moving robot puts in a scan, finding walls as straight lines, and lining two scans up with ICP to measure how the robot moved
tags: robotics lidar algorithms interactive
categories: explainer
series: mobile-robots-from-scratch
part: 9
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
  - /assets/js/mobile-robot/part9.js
  - /assets/js/mobile-robot/mr-scrolly.js
---

{% include mr-series.liquid %}

[Part 8]({% post_url 2026-10-27-mr-8-lidar-how-it-measures %}) showed how a lidar measures hundreds of distances a turn. This part is what the robot does with them: turn them into points, fix the distortion its own motion causes, find the walls, and, most usefully, compare two scans to work out how it moved, with no help from the wheels.

## From ranges to motion, step by step

<section class="tf-scrolly" data-mr-scene="part9">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="polar" data-title="A scan is a list of numbers." markdown="1">
**What the lidar sends is a list of ranges**, one per beam, in order round the turn. This one has 360, one per degree, from 1.28 m (the nearest thing) to 6.38 m.

In ROS this is a `sensor_msgs/LaserScan` message: the angle of the first beam, the step between beams, the time between them, and the array of ranges. Nothing else. Everything the robot learns from the lidar, it learns from this list.

</div>

<div class="tf-step" data-step="points" data-title="Ranges become points." markdown="1">
**Each range, with its beam's angle, is a point in polar coordinates.** Converting it to ordinary $$(x, y)$$ coordinates in the lidar's frame is one line:

$$x = r\cos\theta, \qquad y = r\sin\theta.$$

Beam 40, at 40° and 2.92 m, is at $$(2.24, 1.88)$$. Then part 1's frames take over: the lidar's frame is fixed on the robot (`base_link` → `laser`), the robot's pose places it in the room, and the scan becomes points on the room's walls. Here that's every point at once, red.

</div>

<div class="tf-step" data-step="skew" data-title="A moving robot smears its scan." markdown="1">
**A scan isn't a snapshot.** The head takes 0.1 s to turn once, and the robot keeps moving meanwhile. Drivers usually stamp the whole scan with one time, as if every beam had left from one pose.

Here the robot drives at 0.4 m/s and turns at 1 rad/s while the lidar turns. Drawn from one pose, the points are on average **7.0 cm** off the walls, and the worst 43.6 cm: the walls come out bent, and a corner splits in two.

The fix is **deskewing**: use odometry to find where the robot was when each beam left, and project each beam from its own pose. Press **deskew**: every point is back on its wall. Turning is the main cause: a turn swings far points sideways, by their distance times the angle turned.

</div>

<div class="tf-step" data-step="lines" data-title="Finding the walls." markdown="1">
**Indoors, most of what a lidar sees is flat**: walls, cupboards, boxes. Finding them as straight lines turns hundreds of points into a few lines.

First, split the scan wherever two neighbouring points are far apart (here, over 30 cm): that's an edge, where the beam jumped from one surface to another behind it. That gives 9 runs. Then **split and merge**: draw a line from the first point of a run to the last; if any point is more than 5 cm off it, split the run at the worst point and try again on each half.

The result: 16 lines for 360 points. Lines are compact, and they're what some localisers and mappers match against.

</div>

<div class="tf-step" data-step="icp" data-title="ICP: line two scans up." markdown="1">
**Now the most useful trick.** The robot takes a scan, moves 32 cm and turns 8°, then takes another (blue). Where must the second scan go to line up with the first? The answer is exactly how the robot moved.

**Iterative closest point** (ICP) finds it. Start from a guess (here, no motion at all). Pair each blue point with its nearest red point. Find the rotation and shift that best moves the blue points onto their partners. Move them, and repeat. Scroll to step through the rounds.

**Point-to-point** ICP takes 23 rounds and ends 2.8 cm apart on average. Press the button for **point-to-line**: it measures each gap only along the wall's normal, so it doesn't mind that the two scans hit the wall at different spots. It converges in 6 rounds, to 0.9 cm.

</div>

<div class="tf-step" data-step="chain" data-title="Lidar odometry." markdown="1">
**Do that between every pair of scans**, every 0.2 s, and add up the motions: the robot now has **lidar odometry**, a motion estimate from the room itself. Here it drives part 4's square, with part 4's faulty wheels (orange: 27.3 cm off after a lap).

Point-to-point ICP does worse than the wheels: its small bias, repeated 232 times, adds up to **2.06 m**. Point-to-line ends **6.6 cm** off, turned 0.7°, four times better than the wheels.

It still drifts, a little, because each match has a small error and they add up. Only recognising a place the robot has seen before can remove that: that's SLAM, part 14.

</div>

  </div>
</section>

## ICP in a nutshell

Given pairs of points $$(p_i, q_i)$$, the best rotation and shift in 2-D has a closed form. Subtract each set's mean, $$\bar p$$ and $$\bar q$$, and compute

$$\theta = \operatorname{atan2}\Big(\sum_i p_i' \times q_i',\ \sum_i p_i' \cdot q_i'\Big),$$

where $$p_i'$$ and $$q_i'$$ are the points with their means subtracted. The shift is $$t = \bar q - R(\theta)\,\bar p$$. Every round re-pairs and re-solves.

Three things make ICP work in practice:

- **A good first guess.** ICP finds the nearest alignment, not the best one. Started too far from the answer, it lines the wrong walls up. Wheel odometry is the usual guess.
- **Rejecting bad pairs.** Points seen in only one scan (behind a box, through a door) have no real partner. Drop pairs that are too far apart.
- **Point-to-line** (or point-to-plane in 3-D) error, as above: the standard in real scan matchers.

## What's still missing

- **The software framework.** Drivers, scans, transforms and odometry all pass through ROS 2, which is [part 10]({% post_url 2026-10-27-mr-10-ros2 %}).
- **Lidar odometry drifts too.** Fusing it with the wheels and an IMU is [part 12]({% post_url 2026-10-27-mr-12-kalman-filters %}); recognising places to correct it, [part 14]({% post_url 2026-10-27-mr-14-slam %}).

## Going deeper

### Point-to-line ICP

For each source point $$p$$ (moved by the current guess) and its nearest destination point $$q$$, with $$n$$ the normal of the destination's surface at $$q$$, the error is the distance along the normal, $$e = n \cdot (p - q)$$. For a small extra move $$(\delta x, \delta y, \delta\theta)$$, the error changes by

$$\delta e = n_x\,\delta x + n_y\,\delta y + (n_y p_x - n_x p_y)\,\delta\theta.$$

Stacking these for all pairs gives a 3 × 3 least-squares problem, solved once per round. This is a Gauss–Newton step, the same tool part 14 uses on a whole map. The normals here come from each point's two neighbours in the scan.

### Other ways to match scans

**Correlative scan matching** tries every pose in a small window around the guess and scores each against a grid of the map: slower, but it can't get stuck in a wrong local answer, and it's what Google's Cartographer uses first. The **normal distributions transform** (NDT) turns the reference scan into a grid of small Gaussian blobs and lines the new scan up with them, smoothly. In 3-D, lidar odometry systems like LOAM and its successors match edge and plane features rather than all the points.

### Filtering a scan

Before any of this, drivers and filters (the ROS `laser_filters` package) clean a scan: drop ranges outside the valid limits, drop beams that hit the robot's own body, and remove **veiling** points, the false points a beam produces when it half hits an edge and half the wall behind it, which show up as a short streak between the two.

## Further reading

- F. Lu and E. Milios, [_Robot pose estimation in unknown environments by matching 2D range scans_](https://doi.org/10.1023/A:1007957421070) (1997): the classic scan-matching paper.
- A. Censi, [_An ICP variant using a point-to-line metric_](https://doi.org/10.1109/ROBOT.2008.4543181) (ICRA 2008): PL-ICP and why it converges faster.
- E. Olson, [_Real-time correlative scan matching_](https://doi.org/10.1109/ROBOT.2009.5152375) (ICRA 2009): the brute-force matcher that can't be fooled by a bad guess.
- V. Nguyen et al., [_A comparison of line extraction algorithms using 2D laser rangefinder for indoor mobile robotics_](https://doi.org/10.1109/IROS.2005.1545234) (IROS 2005): split and merge against its rivals.

{% include mr-series.liquid %}
