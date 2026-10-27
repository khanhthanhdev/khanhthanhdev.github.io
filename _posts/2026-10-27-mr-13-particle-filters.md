---
layout: post
title: "mobile robots from scratch, part 13: localisation with particle filters"
date: 2026-10-27 00:00:00 +0700
description: how a robot finds where it is on a known map with no idea where it started, using hundreds of guesses weighed against each lidar scan; why a Kalman filter can't do that; how many guesses it takes; and how the filter recovers when the robot is picked up and moved
tags: robotics localisation particle-filter algorithms interactive
categories: explainer
series: mobile-robots-from-scratch
part: 13
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
  - /assets/js/mobile-robot/part13.js
  - /assets/js/mobile-robot/mr-scrolly.js
---

{% include mr-series.liquid %}

[Part 12]({% post_url 2026-10-27-mr-12-kalman-filters %})'s Kalman filter keeps one guess of where the robot is, with an ellipse around it. That works when the robot roughly knows where it is. But switch a robot on in a room it has a map of, and it has no idea: it could be anywhere, facing any way. And in a building of identical corridors, it might be in one of two places, which no single ellipse can describe.

A **particle filter** describes it with hundreds of guesses instead, and lets the lidar sort them out. On a robot with a map, this is **Monte Carlo localisation** (MCL), and in ROS it's the AMCL node most robots use.

## Finding itself, step by step

<section class="tf-scrolly" data-mr-scene="part13">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="cloud" data-title="Lost: guesses everywhere." markdown="1">
**The robot knows the map of the room**, but not where it is in it. So it makes 400 guesses, called **particles**: each one a full pose $$(x, y, \theta)$$, scattered at random over the free floor, facing random ways (red).

Together they describe what the robot believes. Where particles are dense, the robot is likely to be. Here they're everywhere, so it could be anywhere.

</div>

<div class="tf-step" data-step="weigh" data-title="Weighing each guess." markdown="1">
**The robot takes a scan** (blue: 24 beams). For each particle, it asks: if I were there, facing that way, what would the lidar see? It casts the same 24 beams on the map from the particle's pose, and compares them with the real ranges. The closer they agree, the higher the particle's **weight**:

$$w \propto \prod_{\text{beams}} \exp\!\left(-\frac{(r_{\text{map}} - r_{\text{real}})^2}{2\sigma^2}\right).$$

Most guesses are nowhere near and get almost no weight (grey). One scan is nearly decisive: the **effective number** of particles, which counts how many share the weight, is down to 1, and the heaviest, with 99% of the weight, is 89 cm from the robot: not exact, but in the right part of the room. The other large red dot, with almost all the rest, is a place across the room where the scan happens to look similar.

</div>

<div class="tf-step" data-step="converge" data-title="Move, weigh, resample." markdown="1">
**Then the filter repeats three moves** each time the robot moves and scans:

1. **Move** every particle by the odometry step, plus random noise as large as odometry's errors (part 4), so the cloud spreads as uncertainty grows.
2. **Weigh** each one against the new scan.
3. **Resample**: draw a new set of 400 particles, picking each from the old set in proportion to its weight. Heavy particles are copied many times; light ones vanish.

Scroll to drive the robot along the room. The cloud collapses onto one place, then follows the robot. After 8 scans the best guess is within 20 cm; after 23, it's 1.1 cm from the truth. The particles are a few centimetres apart, which is how sure the filter is.

</div>

<div class="tf-step" data-step="count" data-title="How many guesses?" markdown="1">
**Enough particles must land near the truth** at the start, or the filter settles on a wrong place that looks similar. Slide the number.

With 100, there's no particle close enough, and the filter settles 5.2 m away, sure and wrong. With 200, it ends 72 cm off. With 400 it converges after 8 scans, and with 1,000 after 5. These results change from run to run: with few particles, success is a matter of luck.

The cost grows with the number: each particle casts every beam on the map, every scan. Real localisers use thousands of particles while lost and shrink to a few hundred once they're sure (**KLD sampling**), and draw the first guesses near a pose the user gives in RViz when they can.

</div>

<div class="tf-step" data-step="kidnap" data-title="Picked up and put down." markdown="1">
**Someone carries the robot** to the far corner of the room. The wheels didn't turn, so the odometry says it hasn't moved. Every particle is now in the wrong place, and none is near the truth. Scroll on: the filter is **lost** (the best particle's scan fits the map badly, by 1.7 m), but it has no way to find the right place, and drifts off, 6.3 m away by the end.

This is the **kidnapped robot problem**. The fix: when the scans fit badly, replace some particles, here 10%, with fresh random ones every scan. Press the button. Most fresh particles are wrong, but sooner or later one lands near the truth, its weight is high, and resampling multiplies it. Here the filter is back within 25 cm about 10 scans after the move.

The same trick recovers from any wrong answer, which is why AMCL does it automatically, adding more random particles the worse the recent scans fit.

</div>

  </div>
</section>

## Particles versus a Kalman filter

{: .tf-table}
| | Kalman filter | particle filter |
| ------------------ | ------------------- | --------------------- |
| belief | one Gaussian | any shape |
| lost at the start | can't | can |
| two possible places | can't | can |
| cost | tiny | grows with particles |

A Kalman filter is cheap and smooth, and good at tracking a robot that knows roughly where it is. A particle filter can represent anything, at the cost of many ray casts per scan. On a robot, both run together: part 12's EKF fuses wheels and IMU into smooth odometry (`odom → base_link`), and AMCL corrects it against the map (`map → odom`, part 10).

## What's still missing

- **The map.** Everything here assumed a map of the room. Building one, while localising in it at the same time, is SLAM: [part 14]({% post_url 2026-10-27-mr-14-slam %}).
- **Going somewhere.** Knowing where it is, the robot can now plan a route: [part 15]({% post_url 2026-10-27-mr-15-path-planning-and-navigation %}).

## Going deeper

### Faster weighing: the likelihood field

Casting every beam on the map for every particle is slow. AMCL's default **likelihood field** model doesn't cast rays at all: it precomputes, for every cell of the map, the distance to the nearest wall. To weigh a particle, it puts each beam's end point on the map from the particle's pose and looks up that distance: a lookup per beam instead of a walk along it. It's less exact, since it ignores what's between, but much faster and smoother.

### Why resample, and why not too often

Without resampling, after a few scans one particle holds all the weight and the rest are wasted (**degeneracy**). But resampling also loses variety: copies of one particle are identical until the next motion spreads them. So filters resample only when the effective number of particles,

$$N_{\text{eff}} = \frac{1}{\sum_i w_i^2},$$

falls below a threshold, here half the particles, and use **low-variance** resampling, which picks with one random number and evenly spaced pointers rather than 400 independent draws.

### When the map is wrong

Real rooms change: chairs move, doors open, people walk past. A beam that hits a person gives a short range the map doesn't predict. Beam models include a chance of such short readings, and of max-range misses, so one surprising beam doesn't sink an otherwise good particle. In this page's model, each beam's error is capped at 1.5 m for the same reason.

## Further reading

- F. Dellaert, D. Fox, W. Burgard and S. Thrun, [_Monte Carlo localization for mobile robots_](https://doi.org/10.1109/ROBOT.1999.772544) (ICRA 1999): the method.
- D. Fox, [_Adapting the sample size in particle filters through KLD-sampling_](https://doi.org/10.1177/0278364903022012001) (IJRR 2003): how many particles are enough.
- S. Thrun, W. Burgard and D. Fox, [_Probabilistic Robotics_](https://mitpress.mit.edu/9780262201629/probabilistic-robotics/) (MIT Press, 2005), chapters 4, 6 and 8: particle filters, beam and likelihood-field models, and augmented MCL.
- Nav2, [_nav2_amcl_](https://api.nav2.org/nav2-lyrical/html/md_nav2_amcl_README.html): the ROS 2 localiser.

{% include mr-series.liquid %}
