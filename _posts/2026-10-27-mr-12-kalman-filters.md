---
layout: post
title: "mobile robots from scratch, part 12: sensor fusion with Kalman filters"
date: 2026-10-27 00:00:00 +0700
description: how a Kalman filter combines two uncertain guesses into one better one, predicts and corrects as the robot moves, fuses odometry with measurements in the room as an extended Kalman filter, and why tuning its noise matters as much as its equations
tags: robotics kalman-filter algorithms interactive
categories: explainer
series: mobile-robots-from-scratch
part: 12
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
  - /assets/js/mobile-robot/part12.js
  - /assets/js/mobile-robot/mr-scrolly.js
---

{% include mr-series.liquid %}

Odometry ([part 4]({% post_url 2026-10-27-mr-4-encoders-and-odometry %})) is smooth but drifts. A measurement of something in the room, a beacon, a wall, a landmark, doesn't drift, but it's noisy and only comes now and then. Neither is good enough alone. The **Kalman filter** combines them, and it does more than average them: it keeps track of how uncertain the robot is, and uses that to decide how much to trust each new piece of information.

## Fusing what the robot knows, step by step

<section class="tf-scrolly" data-mr-scene="part12">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="fuse" data-title="Two guesses, one answer." markdown="1">
**A robot is in a corridor.** Its odometry says it's 2.00 m along, give or take 20 cm (orange: one standard deviation, $$\sigma$$, of 20 cm). A range sensor measures 2.30 m, give or take 10 cm (purple). Where is it?

Not halfway. The measurement is more precise, so it should count for more. The best combination weights each guess by how certain it is:

$$\hat x = x_{\text{odo}} + K\,(z - x_{\text{odo}}),$$

$$K = \frac{\sigma_{\text{odo}}^2}{\sigma_{\text{odo}}^2 + \sigma_z^2}.$$

Here the **Kalman gain** $$K$$ is 0.80, so the answer is 2.24 m. And it's more certain than either guess: $$\sigma$$ = 8.9 cm (green). Slide the measurement's $$\sigma$$ up to 20 cm and the gain drops to 0.50: the answer moves halfway. At 40 cm, it barely moves, to 2.06 m. Combining two guesses never makes things worse, as long as their $$\sigma$$s are honest.

</div>

<div class="tf-step" data-step="corridor" data-title="Predict, correct, repeat." markdown="1">
**Now the robot drives down the corridor**, 5 cm a step for 200 steps, and the filter repeats two moves.

**Predict**: add the step the wheels report. The estimate moves, and its uncertainty grows, because each step adds 1 cm of wheel error. **Correct**: whenever there's a measurement (here $$\sigma$$ = 5 cm), fuse it as before. The uncertainty shrinks.

Measuring every 10 steps, the filter's $$\pm 2\sigma$$ band (grey) grows between measurements and snaps back at each one: a sawtooth that never gets wider than 9 cm. After 10 m, odometry alone is 20.8 cm off; the filter, 0.7 cm. Slide to **never**: the filter is then just odometry, and its $$\sigma$$ grows as the square root of the distance, to 14 cm.

</div>

<div class="tf-step" data-step="ekf" data-title="In the room: the extended Kalman filter." markdown="1">
**In 2-D, the robot's state is its pose**, $$(x, y, \theta)$$, and its uncertainty is a 3 × 3 **covariance** matrix. The green ellipse is its 2-σ region: where the filter thinks the robot is, about 86% sure (that's what 2σ means in two dimensions), if it's honest.

The robot drives round the room with wheels 5% noisy, and measures the range and bearing to five known **beacons** (purple) within 4.5 m, once a second. The dashed lines are the beacons it measures. A range and bearing aren't a simple function of $$(x, y, \theta)$$: they involve square roots and angles. The **extended** Kalman filter (EKF) handles that by approximating them as straight lines around the current estimate.

Scroll to drive the lap. The ellipse stretches along the way the robot can't measure well and shrinks with each fix. Odometry (orange, dashed) ends 60 cm off; the filter (green) stays within 8.4 cm all the way round, 3.0 cm on average.

</div>

<div class="tf-step" data-step="range" data-title="It's only as good as what it sees." markdown="1">
**Slide the beacons' range down.** With 3 m, the robot sees fewer beacons, less often, and the filter is 4.9 cm off on average, 18.8 cm at worst. With 1 m, it sees one only near a corner: 8.0 cm on average, and the ellipse balloons between corners. At 0, it's odometry: 32.8 cm on average.

Notice that the ellipse grows when it should. That's the filter's most useful output: not just where the robot is, but how sure it is, so a planner can slow down or a localiser can look harder.

</div>

<div class="tf-step" data-step="tune" data-title="Tuning: telling the filter the truth." markdown="1">
**The filter only knows the noise it's told.** Here the wheels are really 5% noisy. Tell the filter they're 10 times better than that, and it trusts them too much: the beacons barely move it, it's 4.6 cm off on average, and the truth is inside its ellipse only 36% of the time. An **overconfident** filter is the dangerous kind, because it's wrong and sure of it.

Tell it the wheels are 10 times worse, and it's 5.3 cm off: it jumps to every noisy beacon reading. Its ellipse is too big, 99% of the time, which is safe but wasteful. Told the truth, it's 3.0 cm off and inside 93% of the time.

Real tuning means measuring each sensor's noise (part 3), and then checking that the errors fit inside the ellipses as often as they should.

</div>

  </div>
</section>

## The filter, in full

For a state $$x$$ with covariance $$P$$, a motion $$u$$ with noise $$Q$$, and a measurement $$z$$ with noise $$R$$:

**Predict**, with $$f$$ the motion model and $$F$$ its derivative (its Jacobian):

$$x \leftarrow f(x, u), \qquad P \leftarrow F P F^\top + Q.$$

**Correct**, with $$h$$ what the measurement should be from $$x$$, and $$H$$ its Jacobian:

$$K = P H^\top (H P H^\top + R)^{-1},$$

$$x \leftarrow x + K\,(z - h(x)), \qquad P \leftarrow (I - K H)\,P.$$

That's all of it. The 1-D example above is the same equations with every matrix a single number, and $$F = H = 1$$. For a linear $$f$$ and $$h$$ and Gaussian noise, this is the best possible estimate; for the robot's nonlinear ones, the EKF is an approximation that works well as long as the uncertainty stays small.

## On a real robot

Most ROS robots don't use beacons. They run an EKF that fuses the wheels with the **IMU**: the gyro measures turning far better than the difference between two wheels that slip (parts 3 and 4), and the wheels measure forward speed without the gyro's drift. The ROS package **robot_localization** does this; it publishes the `odom → base_link` transform of part 10. A second instance can add GPS outdoors, publishing `map → odom`.

Indoors, the "measurement in the room" is usually the lidar against a map, which is part 13.

## What's still missing

- **Many possibilities at once.** A Kalman filter holds one guess and its ellipse. If the robot doesn't know where it is at all, or two places look the same, one ellipse can't describe that. Particle filters can: [part 13]({% post_url 2026-10-27-mr-13-particle-filters %}).
- **No map to measure against.** The beacons here were at known places. Building the map while localising is SLAM, [part 14]({% post_url 2026-10-27-mr-14-slam %}).

## Going deeper

### Why the Jacobians?

A Gaussian stays Gaussian when passed through a straight-line function, which is what keeps the Kalman filter's equations exact. The EKF replaces $$f$$ and $$h$$ by their tangent lines at the current estimate. For range to a beacon at $$(b_x, b_y)$$, $$h = \sqrt{(b_x - x)^2 + (b_y - y)^2}$$, so the row of $$H$$ is $$\big[-(b_x - x)/h,\ -(b_y - y)/h,\ 0\big]$$: a range tells the robot about its position along the line to the beacon, and nothing about its heading. That's why the ellipse narrows towards the beacons it measures.

### The unscented Kalman filter

Instead of a tangent line, the **UKF** pushes a few carefully chosen points (sigma points) through the real nonlinear function and fits a Gaussian to where they land. It needs no Jacobians, and handles stronger nonlinearity better; robot_localization offers both.

### Outliers

A Kalman filter believes every measurement it's given, weighted by $$R$$. A wrong one, a beacon mistaken for another, pulls the estimate away. The usual guard is a **gate**: compute how far the measurement is from what was expected, in units of its uncertainty (the Mahalanobis distance, with $$H P H^\top + R$$), and ignore it if that's too far.

## Further reading

- R. E. Kalman, [_A new approach to linear filtering and prediction problems_](https://doi.org/10.1115/1.3662552) (1960): the original paper.
- S. Thrun, W. Burgard and D. Fox, [_Probabilistic Robotics_](https://mitpress.mit.edu/9780262201629/probabilistic-robotics/) (MIT Press, 2005), chapters 3 and 7: Kalman filters and EKF localisation, with the derivations.
- T. Moore and D. Stouch, [_A generalized extended Kalman filter implementation for the Robot Operating System_](https://doi.org/10.1007/978-3-319-08338-4_25) (IAS 2014): the robot_localization package.
- [robot_localization documentation](https://docs.ros.org/en/melodic/api/robot_localization/html/index.html): how to set up wheel and IMU fusion in practice.

{% include mr-series.liquid %}
