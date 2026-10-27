---
layout: post
title: "mobile robots from scratch, part 3: what a sensor is"
date: 2026-10-27 00:00:00 +0700
description: the properties every sensor has, noise and bias, what averaging and filtering can and can't fix, an ultrasonic sensor's blind angles, and why a gyro or an accelerometer alone drifts away
tags: robotics sensors interactive
categories: explainer
series: mobile-robots-from-scratch
part: 3
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
  - /assets/js/mobile-robot/part3.js
  - /assets/js/mobile-robot/mr-scrolly.js
---

{% include mr-series.liquid %}

[Part 2]({% post_url 2026-10-27-mr-2-wheels-and-kinematics %}) worked out how wheel speeds move the robot. To use that, the robot has to _measure_ its wheels, and to avoid hitting things it has to measure the room. Everything it knows comes through its **sensors**.

A sensor turns something physical into a number: a voltage, a count of pulses, a time. Every sensor does this imperfectly, and in the same few ways. This part is about those ways, because every algorithm in the rest of the series exists to cope with them.

## Sensors and their flaws, step by step

<section class="tf-scrolly" data-mr-scene="part3">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="kinds" data-title="Two kinds of sensor." markdown="1">
**Some sensors measure the robot, some measure the world.**

**Proprioceptive** sensors measure the robot's own state: how far its wheels turned, how fast it is rotating, how it is accelerating. They work anywhere, even in the dark in an empty hall, but they only say how the robot moved, never where it is.

**Exteroceptive** sensors measure the world around it: a bumper, a range finder, a lidar, a camera. They can tell the robot where it is, but only if there is something to see, and only if it can match what it sees to what it knows.

A good robot uses both. This series covers each kind in turn: encoders in part 4, lidar in parts 8 and 9, depth cameras in part 11, and how to combine them in part 12.

</div>

<div class="tf-step" data-step="noise" data-title="Every reading is a little wrong." markdown="1">
**Point a range sensor at a wall 1.50 m away** and read it 20 times a second for 5 seconds. You don't get 1.50 a hundred times. You get a cloud.

Two different things are wrong with it.

- **Noise**: the readings scatter, randomly, around their own average. Here their standard deviation $$\sigma$$ is 1.8 cm.
- **Bias**: the average itself is off, here by 3.1 cm: it sits at 1.53 m. Maybe the sensor's zero is behind its front face, or the speed of sound was set for a colder room.

The usual words are **precision** for the first (how close readings are to each other) and **accuracy** for the second (how close they are to the truth). Move the sliders: they change the two independently.

</div>

<div class="tf-step" data-step="average" data-title="Averaging beats noise, not bias." markdown="1">
**The obvious fix is to average.** The average of the first $$n$$ readings is 1.53 m for one reading, 1.51 for 4, 1.52 for 16 and 1.53 for all 100.

The noise in an average of $$n$$ independent readings shrinks like

$$\sigma_{\text{avg}} = \frac{\sigma}{\sqrt n},$$

the grey band. Four times as many readings halve the noise. But the average closes in on 1.50 + bias, not on 1.50. **No amount of averaging removes a bias.** The only cure is to **calibrate**: measure against something you know, and subtract the difference.

Set the bias slider to zero and the average homes in on the truth.

</div>

<div class="tf-step" data-step="filter" data-title="Filtering trades noise for lag." markdown="1">
**A robot can't wait for 100 readings.** It needs an answer every time a reading arrives. The simplest running filter is the **exponential moving average**:

$$\hat z \leftarrow \hat z + \alpha\,(z - \hat z).$$

Each new reading pulls the estimate a fraction $$\alpha$$ of the way towards itself.

At 2.5 s, someone steps in front of the sensor, 1 m away. With $$\alpha = 0.3$$ the filtered line (red) has 0.6 cm of noise left, a third of the raw 1.7 cm, and catches up with the person 0.45 s later. With $$\alpha = 0.1$$ the noise drops to 0.4 cm, but it takes 1.45 s to notice. At 0.5 m/s, that's over 70 cm of driving towards someone it hasn't seen yet.

Every filter makes this trade. Part 12's **Kalman filter** makes it as well as it can be made, by also knowing how the robot moves.

</div>

<div class="tf-step" data-step="sonar" data-title="A sensor sees what it sees, not what you meant." markdown="1">
**An ultrasonic sensor**, like the cheap HC-SR04, sends a chirp of sound and times the echo. At 343 m/s, a wall 1.50 m away echoes back in 8.7 ms. The sound leaves in a cone about 15° either side, and the sensor reports the **first** echo from anywhere in it.

Facing the wall straight on, it reads 1.50 m. Turn it 35° and it reads 1.60 m, though the wall straight ahead is 1.83 m away: the echo came from the edge of the cone, where the sound hit the wall more squarely.

Turn it 60° and it reads **nothing**. Sound hitting a smooth wall at a steep angle bounces off like light off a mirror, away from the sensor (grey rays). A robot relying on this sensor drives straight into a wall it approaches at an angle. Try the slider.

</div>

<div class="tf-step" data-step="gyro" data-title="Integrating a gyro: drift." markdown="1">
**A gyroscope measures how fast the robot turns**, in degrees per second. To get the heading, the robot adds up (integrates) those readings over time.

Small MEMS gyros, like those in phones and robot IMUs, have a bias of a fraction of a degree per second, which drifts slowly with temperature. Here the robot is standing still, and the gyro's bias is 0.5°/s. After a minute, the integrated heading says the robot has turned **29.5°**.

The fix is the same as before: calibrate. If the robot stands still for its first 5 seconds and subtracts the average reading, the heading after a minute is off by only −0.6°, from the noise and the slow wander of the bias. That's why many robots ask you not to touch them while they boot.

</div>

<div class="tf-step" data-step="accel" data-title="Integrating twice: worse drift." markdown="1">
**An accelerometer measures acceleration.** Integrate once for speed, again for position. It sounds like the perfect sensor: it needs no wheels and works anywhere.

It isn't. A bias of $$b$$ in acceleration grows into a position error of $$\tfrac12 b t^2$$. A bias of 0.01 m/s², about a thousandth of gravity, is a small one, yet after 1 s the position is off by 0.6 cm, after 5 s by 15.3 cm, and after 10 s by **58.9 cm**.

So an accelerometer alone can't tell a robot where it is for more than a second or two. On a ground robot it's mainly used to find which way is down (gravity), and to catch bumps and tilts.

</div>

  </div>
</section>

## What to ask of any sensor

Every datasheet answers the same questions, and these are the ones that matter for a robot:

{: .tf-table}
| property | question | example |
| ---------- | --------------------------------------------- | ----------------------------------------- |
| range | the smallest and largest value it can measure | an HC-SR04 sees about 2 cm to 4 m |
| resolution | the smallest change it can report | an encoder tick; one step of an ADC |
| noise | how much readings scatter (σ) | 1.8 cm in the figure |
| bias | how far their average is off | 3.1 cm in the figure |
| rate | how many readings per second | a lidar spins 5 to 20 times a second |
| latency | how old a reading is when you get it | a camera frame can be 30 to 100 ms old |
| field of view | which directions it sees | 30° cone; 360° plane; 87° × 58° image |

The last two are easy to forget. A reading is a statement about the past: the robot has moved on since. Part 9 shows what a lidar scan looks like when this is ignored.

## How sensors talk

Sensors hand their numbers to the robot's microcontroller in a few standard ways:

- **digital pins**: on or off (a bumper), or pulses to count or time (an encoder, an ultrasonic echo);
- **analog voltage**, read by an **ADC** (analog-to-digital converter): an IR distance sensor, a battery voltage;
- **I²C** and **SPI**: short buses for chips on the same board, like IMUs (the MPU-6050, the BNO085) and time-of-flight sensors (the VL53L1X);
- **UART** (serial) and **USB**: for sensors that send a stream, like a lidar;
- **Ethernet**: for high-bandwidth sensors, like 3-D lidars and some depth cameras.

Part 6 shows how an ESP32 reads several of these at once without dropping any.

## What's still missing

- **We measured with a sensor pointed at a wall.** [Part 4]({% post_url 2026-10-27-mr-4-encoders-and-odometry %}) builds a sensor the robot can count on everywhere: the wheel encoder, and turns its counts into a pose.
- **We met drift twice.** Integrating a rate sensor (gyro, accelerometer, and next time, wheel encoders) always drifts. The cure, combining it with a sensor that sees the world, is [part 12]({% post_url 2026-10-27-mr-12-kalman-filters %}).

## Going deeper

### Noise models

The figure draws noise from a **Gaussian** (normal) distribution: $$z = d + b + \varepsilon$$, with $$\varepsilon \sim \mathcal N(0, \sigma^2)$$. That's a good model for many sensors, for a reason: noise that comes from adding up many small independent effects tends to be Gaussian (the central limit theorem). It is also the model that makes the maths of part 12 come out in closed form.

Real sensors add other kinds of error. A range sensor sometimes returns a **max-range** reading when it hears no echo, or a **short** one when someone walks past. Part 13's particle filter uses a sensor model that mixes a Gaussian with these, so one wild reading can't wreck the estimate.

### Why √n

If readings $$z_1, \dots, z_n$$ are independent with variance $$\sigma^2$$, their sum has variance $$n\sigma^2$$, because variances of independent things add. Dividing by $$n$$ divides the variance by $$n^2$$:

$$\operatorname{Var}\Big(\frac1n \sum z_i\Big) = \frac{n \sigma^2}{n^2} = \frac{\sigma^2}{n}.$$

The standard deviation is the square root: $$\sigma / \sqrt n$$. This only works for **independent** noise. A bias is the same in every reading, so it survives the average untouched.

### The moving average's lag

For the exponential moving average with factor $$\alpha$$, after a sudden step the remaining error shrinks by a factor $$(1 - \alpha)$$ per reading. Closing 90% of the gap takes $$\ln 0.1 / \ln(1 - \alpha)$$ readings: 6.5 for $$\alpha = 0.3$$ and 22 for $$\alpha = 0.1$$, which at 20 readings a second is 0.32 s and 1.09 s. (The figure's times are longer because it waits until the estimate is within 2.5 cm, 95% of the way, through the noise.)

In steady state, the noise left over is

$$\sigma_{\hat z} = \sigma \sqrt{\frac{\alpha}{2 - \alpha}},$$

0.42σ for $$\alpha = 0.3$$ and 0.23σ for $$\alpha = 0.1$$. Smaller $$\alpha$$: less noise, more lag. There is no setting that gives both.

### Allan variance

Gyro datasheets describe noise with two numbers: **angle random walk** (white noise, in °/√h) and **bias instability** (how far the bias wanders, in °/h). Both come from the **Allan variance**: record the gyro standing still for hours, average it over windows of length $$\tau$$, and see how much neighbouring windows differ. For short windows, white noise dominates and averaging helps; for long ones, the wandering bias dominates and averaging stops helping. The bottom of the curve says how long you can usefully average.

## Further reading

- S. Thrun, W. Burgard and D. Fox, [_Probabilistic Robotics_](https://mitpress.mit.edu/9780262201629/probabilistic-robotics/) (2005), chapter 6: sensor models, including the beam model with its mixture of noise, short readings and max-range readings.
- O. Woodman, [_An introduction to inertial navigation_](https://www.cl.cam.ac.uk/techreports/UCAM-CL-TR-696.pdf) (2007): why integrated gyros and accelerometers drift, and the Allan variance.
- R. Siegwart, I. Nourbakhsh and D. Scaramuzza, [_Introduction to Autonomous Mobile Robots_](https://mitpress.mit.edu/9780262015356/introduction-to-autonomous-mobile-robots/), chapter 4: a survey of robot sensors and their properties.
- [IEEE Std 952](https://doi.org/10.1109/IEEESTD.1998.86153): the standard for specifying gyros, with the Allan variance method.

{% include mr-series.liquid %}
