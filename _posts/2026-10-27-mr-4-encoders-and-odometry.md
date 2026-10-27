---
layout: post
title: "mobile robots from scratch, part 4: encoders and odometry"
date: 2026-10-27 00:00:00 +0700
description: how a Hall-effect encoder counts wheel turns, how quadrature tells forward from back, how the counts become a pose, and why that pose drifts away from the truth
tags: robotics sensors odometry interactive
categories: explainer
series: mobile-robots-from-scratch
part: 4
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
  - /assets/js/mobile-robot/part4.js
  - /assets/js/mobile-robot/mr-scrolly.js
---

{% include mr-series.liquid %}

[Part 2]({% post_url 2026-10-27-mr-2-wheels-and-kinematics %}) showed that if you know how far each wheel has rolled, you know how the robot moved. [Part 3]({% post_url 2026-10-27-mr-3-what-a-sensor-is %}) showed that every measurement is a little wrong. This part builds the sensor that measures wheel travel, the **encoder**, and adds its counts up into a pose: **odometry**, the robot's first, cheapest and most-used estimate of where it is.

## Counting wheel turns, step by step

<section class="tf-scrolly" data-mr-scene="part4">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="disc" data-title="A magnet disc and a sensor." markdown="1">
**The hobby gear motors on our robot have an encoder built in.** On the back of the motor, a small disc on the motor's shaft carries 11 pairs of magnets, north and south alternating (red and blue). A **Hall-effect sensor** next to it outputs 1 when a north pole passes and 0 for a south pole.

So as the motor turns, the sensor's output, A, is a square wave: 11 pulses per motor turn. Count the pulses, and you know how far the motor has turned. Scroll to turn it.

Optical encoders work the same way with a slotted disc and a light, and magnetic **absolute** encoders (like the AS5600) read the angle of a single magnet directly. All of them turn rotation into numbers.

</div>

<div class="tf-step" data-step="quadrature" data-title="Two sensors tell forward from back." markdown="1">
**One sensor can't tell which way the wheel is turning**: a pulse is a pulse. So there is a second sensor, B, placed a quarter of a pulse further round. Its wave is the same, shifted by a quarter cycle. This is **quadrature**.

Read the pair as two bits. Going forward, they step through 00 → 10 → 11 → 01 and back to 00: A changes first. Going backwards, the order reverses, and B changes first. Press **reverse** to see it.

Only one bit changes at a time (a Gray code), so every change says exactly one thing: one step forward, or one step back. Counting on every edge of both waves gives **4 counts per pulse**.

</div>

<div class="tf-step" data-step="resolution" data-title="From counts to millimetres." markdown="1">
**The motor turns 30 times for every turn of the wheel** (its gearbox is 30:1). So one wheel turn is

$$11 \text{ pulses} \times 4 \text{ edges} \times 30 = 1{,}320 \text{ counts}.$$

The wheel is 70 mm across, so it rolls $$\pi \times 70 = 220$$ mm per turn, and one count is **0.167 mm** of travel. In code:

$$d = \frac{\Delta \text{counts}}{1320} \cdot 2\pi r.$$

That's very fine. The trouble, as we'll see, isn't the resolution. It's that the formula assumes a wheel radius, and the real wheel doesn't care what you assumed.

</div>

<div class="tf-step" data-step="odometry" data-title="Odometry: adding up the steps." markdown="1">
**Every 20 ms, the robot reads both encoder counts**, turns the change in each into a distance $$d_l$$ and $$d_r$$, and moves its pose estimate by part 2's exact arc:

$$\Delta s = \frac{d_l + d_r}{2}, \qquad \Delta\theta = \frac{d_r - d_l}{L}.$$

Here it drives the classic test: a 3 m square, anticlockwise, turning on the spot at each corner. Scroll to drive.

This robot is perfect: its wheels are exactly the size the software thinks, and they never slip. The odometry (orange, dashed) sits exactly on the truth (blue), and both end back at the start. The left wheel ends at 67,880 counts and the right at 76,177: the left one ran backwards on every corner.

</div>

<div class="tf-step" data-step="errors" data-title="Small errors, big drift." markdown="1">
**Now make the robot real.** Its right wheel is 0.5% bigger than the software thinks (a little more air in a tyre, or a little wear on the other). And the real distance between the wheels' contact points is 1% wider than the number in the code.

Odometry still says the robot drove a perfect square and came home. It didn't: it's **46.1 cm** away, turned 12.8°.

Try each error alone. The 0.5% wheel error on its own puts the robot 59.0 cm off, because a bigger right wheel makes the robot curve left on every straight. The 1% track error alone gives 13.3 cm: the robot turns about 1% less than it thinks at every corner. Here the two partly cancel. Driven the other way round, they'd add up: that's why the test is run both ways.

</div>

<div class="tf-step" data-step="slip" data-title="Slip: errors no calibration can fix." markdown="1">
**Wheels also slip**: on dust, on the edge of a rug, when they spin up or brake. Slip makes a wheel cover less floor than it turned.

Here the wheels are the right size, but each slips a random amount every 20 ms, 2% on average. After one lap the robot is 20.3 cm from where odometry thinks, turned −4.6°.

A wrong wheel radius is a **systematic** error: it's the same every time, so it can be measured and fixed (in the box below). Slip is **random**: there's nothing to calibrate. All odometry can do is report how unsure it has become, which part 12 uses.

</div>

<div class="tf-step" data-step="growth" data-title="The error only grows." markdown="1">
**Put all three errors together** and drive three laps. The error is 26.1 cm after one lap (12 m), 50.4 cm after two, and **83.0 cm** after three.

Odometry never gets a chance to correct itself: each step is added to the last, errors included. A heading error is the worst kind, because every later metre of straight driving goes off in the wrong direction.

So odometry is excellent over a few metres, and useless over a few hundred. Everything from part 8 onwards gives the robot a way to see where it really is, and so to pull the drifting odometry back.

</div>

  </div>
</section>

## Odometry in code

The whole algorithm fits in a dozen lines. This is what a microcontroller or the ROS `diff_drive_controller` runs, every control cycle:

```python
TICKS_PER_REV = 1320
R = 0.035      # wheel radius (m)
L = 0.22       # wheel separation (m)
x = y = theta = 0.0
last_l = last_r = 0

def update(ticks_l, ticks_r):
    global x, y, theta, last_l, last_r
    dl = (ticks_l - last_l) / TICKS_PER_REV * 2 * math.pi * R
    dr = (ticks_r - last_r) / TICKS_PER_REV * 2 * math.pi * R
    last_l, last_r = ticks_l, ticks_r
    ds = (dl + dr) / 2
    dth = (dr - dl) / L
    x += ds * math.cos(theta + dth / 2)   # the midpoint form from part 2
    y += ds * math.sin(theta + dth / 2)
    theta = wrap(theta + dth)
```

Two details matter on real hardware. Encoder counters are often 16- or 32-bit, so they **wrap around**: compute differences in the counter's own width, so that a jump from 32,767 to −32,768 counts as one step forward. And the speed you report (counts per cycle divided by the cycle time) is noisy at low speeds, when only one or two counts arrive per cycle; part 5 deals with that.

## What's still missing

- **The counts have to be read without missing any.** At top speed each of our encoders produces nearly 4,000 edges a second, and finer encoders produce hundreds of thousands. Part 6 shows how an ESP32 counts them all in hardware.
- **Odometry drifts, and always will.** Parts 12 to 14 combine it with sensors that see the world.
- **We commanded wheel speeds and got them.** Real motors need a controller to hit a speed. That's part 5.

## Going deeper

### Calibrating odometry: UMBmark

J. Borenstein and L. Feng's **UMBmark** test, from 1996, is still the standard way to calibrate a differential drive. Drive a square of known size, measure where the robot really ends up, and repeat several times **clockwise** and **anticlockwise**.

The two main systematic errors behave differently. A **wheel-diameter** mismatch makes the robot curve the same way in both directions, so it moves the clockwise and anticlockwise end points the same way. A **track-width** error makes the robot over- or under-turn at the corners, which pushes the end points in opposite directions. From the two clusters of end points, the method solves for both corrections. After calibration, Borenstein and Feng report about a tenfold drop in systematic error.

### The uncertainty of odometry

Model each wheel's travel as the measured distance plus noise whose variance grows with the distance: $$\sigma_l^2 = k\,\lvert d_l\rvert$$, $$\sigma_r^2 = k\,\lvert d_r\rvert$$. Pushing this through the pose update (with the Jacobian of the update with respect to $$d_l$$ and $$d_r$$) gives a covariance matrix for the pose after each step, and it adds up step by step. The uncertainty ellipse grows as the robot drives, fastest sideways to the direction of travel, because heading errors turn into sideways errors. Part 12's Kalman filter uses exactly this.

### Why heading errors are the worst

Drive straight for a distance $$D$$ with a constant heading error $$\delta\theta$$, and the sideways error is $$D \sin\delta\theta \approx D\,\delta\theta$$. But if the heading error itself grows along the way, as it does with a wheel-size mismatch ($$\delta\theta = \epsilon D / L$$ for a fractional mismatch $$\epsilon$$), the sideways error grows as

$$\int_0^D \frac{\epsilon s}{L}\, ds = \frac{\epsilon D^2}{2L}.$$

For our robot, a 0.5% mismatch over one 3 m side gives $$0.005 \times 9 / 0.44 = 10$$ cm, and the heading is off by 3.9° at the end of it. Over a long drive, error grows with the **square** of the distance. That's why a gyro, which measures heading directly, helps odometry so much, and why many robots fuse the two (part 12).

## Further reading

- J. Borenstein and L. Feng, [_Measurement and correction of systematic odometry errors in mobile robots_](https://doi.org/10.1109/70.544770) (1996): the UMBmark method.
- J. Borenstein, H. R. Everett and L. Feng, [_Where am I? Sensors and methods for mobile robot positioning_](https://www-personal.umich.edu/~johannb/Papers/pos96rep.pdf) (1996): a classic free report on odometry, encoders and dead reckoning.
- S. Thrun, W. Burgard and D. Fox, [_Probabilistic Robotics_](https://mitpress.mit.edu/9780262201629/probabilistic-robotics/), chapter 5: the odometry motion model and its noise.
- Espressif, [ESP-IDF pulse counter (PCNT)](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/pcnt.html): the hardware quadrature decoder we'll use in part 6.

{% include mr-series.liquid %}
