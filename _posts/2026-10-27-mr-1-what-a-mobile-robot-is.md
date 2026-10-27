---
layout: post
title: "mobile robots from scratch, part 1: what a mobile robot is"
date: 2026-10-27 00:00:00 +0700
description: the sense–think–act loop, the robot's pose, and the frames every wheeled robot keeps track of, worked through in a simulated room
tags: robotics ros2 interactive
categories: explainer
series: mobile-robots-from-scratch
part: 1
series_title: mobile robots from scratch
series_description: a scroll-through course on building a wheeled robot that finds its own way, from wheels, encoders and motors through ESP32, Raspberry Pi and Jetson, lidar, ROS 2 and depth cameras to Kalman filters, SLAM and navigation, with every algorithm running live in a simulated room in your browser
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
  - /assets/js/mobile-robot/part1.js
  - /assets/js/mobile-robot/mr-scrolly.js
---

{% include mr-series.liquid %}

A robot vacuum leaves its dock, cleans every room and drives back to the dock. A warehouse robot carries a shelf across a building full of people. A delivery robot crosses a campus. None of them follows a painted line. Each one keeps answering the same few questions, many times a second: _where am I, what is around me, where should I go, and how do I get there?_

This series builds the answers from the ground up. We start with a wheel and a motor, and finish with a robot that maps a room it has never seen and plans its way through it. Along the way come the parts people actually buy: encoders, IMUs, an **ESP32** microcontroller, a **Raspberry Pi** or **NVIDIA Jetson** computer, **lidar**, **depth cameras**, and the software that ties them together, **ROS 2**.

Every figure runs a simulated robot in a simulated room, in your browser. The robot has the same wheels, the same encoders and the same sensor noise from part to part, so the drift you see in part 4 is the drift the Kalman filter fixes in part 12. Every number quoted in the text is computed by the same code.

This first part sets up the vocabulary: what a mobile robot is made of, how we write down where it is, and how it relates what its sensors see to the room around it.

## The robot we'll build

The robot in this series is the kind people build at home or in a university lab:

- a round body with **two driven wheels**, one on each side, and a free-turning caster wheel to keep it level;
- two small **DC gear motors** with **encoders**, which count how far each wheel has turned;
- an **IMU** (gyroscope and accelerometer), a 360° **lidar**, and later a **depth camera**;
- an **ESP32** microcontroller that drives the motors and reads the encoders in real time;
- a **Raspberry Pi** or **Jetson** that runs ROS 2, builds the map and plans the route.

Its wheels are 70 mm across and 220 mm apart, and each encoder gives 1,320 counts per turn of the wheel. We'll see where those numbers come from in parts 2 and 4.

## Where the robot is, step by step

<section class="tf-scrolly" data-mr-scene="part1">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="loop" data-title="Sense, think, act." markdown="1">
**Every robot runs one loop.** It **senses**: reads its encoders, its IMU, its lidar. It **thinks**: updates what it believes about itself and the room, and decides what to do. It **acts**: sends speeds to its motors.

Then the world answers. The wheels slip a little, a person walks past, the floor turns to carpet. The next turn of the loop has to deal with whatever happened.

The loop runs at different speeds for different jobs. Motor control runs hundreds or thousands of times a second, on the microcontroller. Building a map runs a few times a second, on the bigger computer. This series climbs the loop from the bottom: motors and encoders first, maps and plans last.

</div>

<div class="tf-step" data-step="pose" data-title="A pose is three numbers." markdown="1">
**This is the room the robot lives in**, seen from above: 10 m by 6 m, with a box, a table, a short wall, a pillar and a cabinet. The origin is the bottom-left corner. $$x$$ points right, $$y$$ points up.

A robot on a flat floor can be anywhere in the room and face any way. Three numbers say which: its position $$x$$ and $$y$$ in metres, and its **heading** $$\theta$$, the angle from the $$x$$ axis, counted anticlockwise. Together they are its **pose**:

$$\text{pose} = (x, y, \theta) = (1.20\ \text{m},\ 0.90\ \text{m},\ 20^\circ)$$

Drag the slider to turn the robot. Its position stays put; only $$\theta$$ changes. Most robotics code stores $$\theta$$ in radians, from $$-\pi$$ to $$\pi$$.

</div>

<div class="tf-step" data-step="frames" data-title="The robot has its own frame." markdown="1">
**Sensors don't know where the robot is.** A lidar on the robot reports what it sees relative to itself: "something 1.57 m away, a little to my left". It describes the world in the **robot's frame**: $$x'$$ points straight ahead, $$y'$$ points to the robot's left.

The corner of the box, P, is at (2.60, 1.60) in the room. In the robot's frame it is at (1.55, 0.18): 1.55 m ahead and 18 cm to the left.

To go from the room to the robot's frame, subtract the robot's position, then rotate by $$-\theta$$:

$$\begin{aligned} x' &= \cos\theta\,\Delta x + \sin\theta\,\Delta y \\ y' &= -\sin\theta\,\Delta x + \cos\theta\,\Delta y \end{aligned}$$

Here $$\Delta x = 1.40$$, $$\Delta y = 0.70$$, $$\cos 20^\circ = 0.940$$ and $$\sin 20^\circ = 0.342$$, which gives $$x' = 1.55$$ and $$y' = 0.18$$. Turn the robot with the slider: P's room coordinates never change, but its coordinates in the robot's frame do.

</div>

<div class="tf-step" data-step="moving" data-title="As it drives, its view of the world changes." markdown="1">
**Now let it drive.** The robot rolls forward at 0.3 m/s while turning left, for 6 seconds. Scroll to move it along.

P never moves in the room. In the robot's frame it slides past: from 1.55 m ahead at the start, to (−0.76, −0.44) at the end, behind the robot and to its right.

This is the whole problem of a mobile robot in miniature. Its sensors measure the world in its own moving frame. To build a map, or to follow one, it has to know its own pose, so it can carry every measurement over into the room's frame.

</div>

<div class="tf-step" data-step="chain" data-title="Frames form a chain." markdown="1">
**A real robot has more than two frames.** The lidar isn't at the robot's centre. On our robot it sits 8 cm ahead of it, so it has a frame of its own, `laser`. The robot's frame is called `base_link`.

ROS, the software we'll use from part 10, names the frames of a wheeled robot by a shared convention, [REP 105](https://www.ros.org/reps/rep-0105.html):

- `map`: fixed to the room;
- `odom`: where the robot's wheel odometry started counting;
- `base_link`: fixed to the robot;
- one frame per sensor, here `laser`.

Each link in the chain is one pose. To put a lidar point on the map, apply the links one by one: P is at (1.47, 0.18) from the lidar, (1.55, 0.18) from the robot's centre, and (2.60, 1.60) on the map.

</div>

<div class="tf-step" data-step="drift" data-title="Odometry drifts, so map and odom part ways." markdown="1">
**Why are there both `map` and `odom`?** The robot works out its pose by counting wheel turns, called **odometry** (part 4). Odometry is smooth and fast, but every small error adds up.

Here the robot drives a 2.5 m square, and its right wheel is just 0.4% bigger than the software thinks. Its track is 1% wider. After 40 seconds, odometry says the robot is back where it started, at (1.00, 0.80). It is really at (1.17, 0.65), turned 7.5°: **23 cm** away.

So the robot keeps two estimates. `odom → base_link` is the smooth one from the wheels, which drifts. `map → odom` is the correction that something smarter, a localiser or SLAM, keeps adjusting so that the chain ends at the true pose. Here that correction is (0.28, −0.27, 7.5°). Parts 12 to 14 are about computing it.

</div>

  </div>
</section>

## Frames in one line

A pose $$a = (x, y, \theta)$$ is also a **transform**: it takes a point $$p$$ given in the robot's frame to the room's frame,

$$T_a(p) = R(\theta)\, p + \begin{pmatrix} x \\ y \end{pmatrix}, \qquad R(\theta) = \begin{pmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{pmatrix}.$$

Going the other way, from the room to the robot, undoes it: $$T_a^{-1}(q) = R(\theta)^\top (q - (x, y))$$. That is the formula in the step above.

Two operations on poses come up in every later part:

{: .tf-table}
| operation | written | meaning | used for |
| -------------------- | ---------------- | ---------------------------------------------- | ------------------------------------------------ |
| composition | $$a \oplus b$$ | pose $$b$$, given in $$a$$'s frame, in the room | chaining frames; adding a step of odometry |
| relative pose | $$a \ominus b$$ | pose $$b$$ as seen from pose $$a$$ | how far the robot moved between two moments |

## What's still missing

- **We assumed the robot knows its pose.** It doesn't. Every later part is, one way or another, about estimating it.
- **We moved the robot by decree.** A real robot moves by turning its wheels. [Part 2]({% post_url 2026-10-27-mr-2-wheels-and-kinematics %}) works out exactly how two wheel speeds become a motion of the whole robot.

## Going deeper

### Homogeneous transforms

Composition is easier to write with a 3 × 3 matrix. Add a 1 under every point, $$(p_x, p_y, 1)$$, and write the pose as

$$T = \begin{pmatrix} \cos\theta & -\sin\theta & x \\ \sin\theta & \cos\theta & y \\ 0 & 0 & 1 \end{pmatrix}.$$

Then moving a point is one matrix product, $$T p$$, and chaining frames is a product of matrices: $$T_{\text{map}\to\text{laser}} = T_{\text{map}\to\text{odom}}\, T_{\text{odom}\to\text{base}}\, T_{\text{base}\to\text{laser}}$$. The inverse is

$$T^{-1} = \begin{pmatrix} R^\top & -R^\top t \\ 0 & 1 \end{pmatrix}.$$

ROS's `tf2` library does exactly this, in 3-D with 4 × 4 matrices, for every frame on the robot, many times a second.

### Conventions

Robots break in confusing ways when two pieces of code disagree on a convention. ROS fixes them in [REP 103](https://www.ros.org/reps/rep-0103.html):

- SI units: metres, seconds, radians.
- Right-handed frames. On the robot, $$x$$ forward, $$y$$ left, $$z$$ up.
- Angles anticlockwise when seen from above (from $$+z$$).

Cameras are the exception: the optical frame has $$z$$ forward, $$x$$ right and $$y$$ down, the way image rows run. We'll meet it in part 11.

### Angles wrap around

A heading of 179° and one of −179° are 2° apart, not 358°. Every time code subtracts two angles, it has to wrap the result back into $$(-\pi, \pi]$$:

$$\operatorname{wrap}(\alpha) = \alpha - 2\pi \left\lfloor \frac{\alpha + \pi}{2\pi} \right\rfloor.$$

Forgetting it is one of the classic robot bugs: the robot spins a full turn the long way round, or a filter decides it is wildly wrong whenever it faces west.

### Three dimensions

A drone or a robot arm needs six numbers: position $$(x, y, z)$$ and orientation (roll, pitch, yaw). Writing orientation as three angles runs into trouble at some poses (gimbal lock), so ROS stores it as a **quaternion**, four numbers $$(x, y, z, w)$$ with $$x^2 + y^2 + z^2 + w^2 = 1$$. For a robot on a flat floor, only yaw is non-zero, and the quaternion is $$(0, 0, \sin\frac\theta2, \cos\frac\theta2)$$.

## Further reading

- R. Siegwart, I. Nourbakhsh and D. Scaramuzza, [_Introduction to Autonomous Mobile Robots_](https://mitpress.mit.edu/9780262015356/introduction-to-autonomous-mobile-robots/) (2nd ed., 2011): the standard textbook; chapter 3 covers frames and kinematics.
- K. Lynch and F. Park, [_Modern Robotics_](http://hades.mech.northwestern.edu/index.php/Modern_Robotics) (2017): rigid-body motions and homogeneous transforms, with free videos.
- ROS [REP 105](https://www.ros.org/reps/rep-0105.html), _Coordinate Frames for Mobile Platforms_, and [REP 103](https://www.ros.org/reps/rep-0103.html), _Standard Units of Measure and Coordinate Conventions_.
- T. Foote, [_tf: The transform library_](https://doi.org/10.1109/TePRA.2013.6556373) (2013): how ROS keeps the tree of frames.

{% include mr-series.liquid %}
