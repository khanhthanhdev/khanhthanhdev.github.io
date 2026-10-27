---
layout: post
title: "mobile robots from scratch, part 2: wheels and kinematics"
date: 2026-10-27 00:00:00 +0700
description: how two wheel speeds become one motion of the robot, the centre it turns about, the sideways move it can't make, and the error of adding up motion in steps
tags: robotics kinematics interactive
categories: explainer
series: mobile-robots-from-scratch
part: 2
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
  - /assets/js/mobile-robot/part2.js
  - /assets/js/mobile-robot/mr-scrolly.js
---

{% include mr-series.liquid %}

[Part 1]({% post_url 2026-10-27-mr-1-what-a-mobile-robot-is %}) moved the robot by decree: put it here, turn it there. A real robot moves by spinning its wheels, and the software has to work out what a given pair of wheel speeds will do to the whole robot, and which wheel speeds will make it do what it wants. That relation is the robot's **kinematics**.

This part works it out for the most common design, the one in robot vacuums, the TurtleBot and most home-built robots: the **differential drive**.

## Two wheels, step by step

<section class="tf-scrolly" data-mr-scene="part2">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="wheels" data-title="Two wheels, each with its own speed." markdown="1">
**A differential drive has two driven wheels on one axle**, one each side, and a caster that just follows. Each wheel has its own motor. There is no steering: the robot steers by driving its wheels at different speeds, the "difference" in its name.

Our robot's wheels are $$L = 0.22$$ m apart. Each wheel's speed, $$v_l$$ for the left and $$v_r$$ for the right, is how fast its contact point moves over the floor, in m/s: the wheel's turning speed times its radius, 35 mm.

The orange arrows show the two speeds. Here both are 0.30 m/s.

</div>

<div class="tf-step" data-step="straight" data-title="Equal speeds: a straight line." markdown="1">
**When both wheels go at the same speed**, both sides of the robot cover the same distance, so it drives straight. At 0.30 m/s, the robot covers 1.20 m in the 4 seconds shown. Scroll to move it.

The speed of the robot itself, $$v$$, is the speed of the point midway between the wheels. It is the average:

$$v = \frac{v_l + v_r}{2}.$$

</div>

<div class="tf-step" data-step="arc" data-title="Different speeds: an arc." markdown="1">
**When the right wheel is faster**, the right side covers more ground, and the robot curves left. With $$v_l = 0.20$$ and $$v_r = 0.40$$ m/s it drives a circle.

At every moment, the robot rotates about one point on the line through its axle: the **instantaneous centre of rotation** (ICR, purple). Both wheels go round it, on circles of different sizes. Their speeds are in proportion to their distances from it, which pins down where it is.

The robot turns at

$$\omega = \frac{v_r - v_l}{L},$$

here $$0.20 / 0.22 = 0.91$$ rad/s, on a circle of radius $$R = v / \omega = 0.33$$ m. Move the sliders: the ICR slides along the axle line, far away for a gentle curve, close for a tight one.

</div>

<div class="tf-step" data-step="spin" data-title="Opposite speeds: turn on the spot." markdown="1">
**With equal and opposite speeds**, $$v = 0$$: the robot doesn't go anywhere, and the ICR sits at its centre. It turns on the spot, here at $$0.40 / 0.22 = 1.82$$ rad/s, about 104° a second.

This is what makes the differential drive so popular indoors. A car needs space to turn round; this robot can face any way without moving. A round robot that turns on the spot can always get out of any place it got into.

</div>

<div class="tf-step" data-step="sideways" data-title="What it can't do: move sideways." markdown="1">
**There is one motion no pair of wheel speeds gives**: sliding sideways. The wheels can only roll forward and back; they don't slide along their axle. So at every moment the robot's velocity points along its heading.

To end up 0.50 m to its left, facing the same way, the robot has to turn left, drive 0.50 m, and turn back, about 5 seconds of manoeuvring for something a robot with omni-wheels does directly.

This is called a **nonholonomic** constraint: the robot can reach every pose, but not by moving in every direction. It is why planners for wheeled robots (part 15) can't just draw a straight line to the goal.

</div>

<div class="tf-step" data-step="steps" data-title="Adding up motion in steps." markdown="1">
**Software doesn't move the robot continuously.** It updates the pose once per time step $$dt$$, from the speeds in that step. The simplest update, **Euler's method**, moves along the current heading, then turns:

$$\begin{aligned} x &\mathrel{+}= v\,dt\cos\theta \\ y &\mathrel{+}= v\,dt\sin\theta \\ \theta &\mathrel{+}= \omega\,dt \end{aligned}$$

The thin line is half a circle of radius 0.5 m, driven in 5 s. Red is Euler; green uses the heading **midway** through each step instead. Scroll to make the steps longer.

With $$dt = 0.1$$ s, Euler ends 3.1 cm from the true end. With 0.5 s steps it's 15.7 cm off, and with 1 s steps 31.6 cm. The midpoint version stays within 1.7 cm even then. Real robots update every 10 to 50 ms, where both are fine, but the error adds up over a long drive: use the midpoint form, or the exact arc in the box below.

</div>

  </div>
</section>

## The whole thing in two lines

Forward kinematics, wheel speeds to body motion:

$$v = \frac{v_l + v_r}{2}, \qquad \omega = \frac{v_r - v_l}{L}.$$

Inverse kinematics, body motion to wheel speeds, which is what the robot's software actually needs: a planner says "go at 0.3 m/s and turn at 0.6 rad/s", and the motor controller needs a speed for each wheel:

$$v_l = v - \frac{\omega L}{2}, \qquad v_r = v + \frac{\omega L}{2}.$$

For 0.3 m/s and 0.6 rad/s, that's 0.234 m/s for the left wheel and 0.366 m/s for the right. In ROS, this pair $$(v, \omega)$$ is the `geometry_msgs/Twist` message on the `/cmd_vel` topic, and the node that converts it to wheel speeds is the `diff_drive_controller`.

**The exact pose update.** For constant speeds over a step of length $$dt$$, the robot moves on an exact arc. With $$\Delta s = v\,dt$$ and $$\Delta\theta = \omega\,dt$$:

$$\begin{aligned} x' &= x + r\,\big(\sin\theta' - \sin\theta\big) \\ y' &= y - r\,\big(\cos\theta' - \cos\theta\big) \\ \theta' &= \theta + \Delta\theta \end{aligned}$$

with $$r = \Delta s / \Delta\theta$$, the radius of the arc.

When $$\Delta\theta$$ is near zero, use the straight-line step instead, to avoid dividing by zero. This is the update the simulation in this series uses.

## Other ways to drive

{: .tf-table}
| drive | steers by | sideways? | seen on |
| -------------- | ----------------------- | --------- | --------------------- |
| differential | two wheel speeds | no | vacuums, TurtleBot |
| skid steer | skidding both sides | no | tracked robots, rovers |
| Ackermann | turning the front wheels | no | cars, outdoor robots |
| mecanum, omni | rollers on the wheels | yes | warehouse carts |

Only the car can't turn on the spot. Skid steer uses the same formulas as the differential drive, but its wheels have to skid sideways to turn, so the effective track is wider than the real one and changes with the floor. Ackermann steering follows a **bicycle model**: $$\omega = v \tan\delta / \ell$$, with $$\delta$$ the steering angle and $$\ell$$ the wheelbase. Mecanum and omni wheels have small free rollers around their rim, so they can roll sideways too: those robots are **holonomic**.

## What's still missing

- **We assumed the wheels turn at the speeds we asked for.** A motor doesn't. Part 5 closes the loop with a PID controller.
- **We assumed the software knows how far each wheel has turned.** It has to measure that, with encoders, and turning wheel turns into a pose is **odometry**, part 4. First, part 3 asks what a sensor is in the first place.

## Going deeper

### Where the ICR is

In time $$dt$$ the robot turns by $$\omega\,dt$$ about the ICR, at distance $$R$$ to the left of its centre. The left wheel is at distance $$R - L/2$$ from the ICR, the right at $$R + L/2$$, and each covers its circle at its own speed:

$$v_l = \omega\,(R - L/2), \qquad v_r = \omega\,(R + L/2).$$

Subtracting gives $$\omega = (v_r - v_l)/L$$; adding gives $$v = \omega R$$, so

$$R = \frac{L}{2} \cdot \frac{v_r + v_l}{v_r - v_l}.$$

Equal speeds put the ICR at infinity (straight ahead); opposite speeds put it at the centre; one wheel stopped puts it on that wheel.

### The speeds the wheels allow

Each wheel has a top speed. Our motors turn the wheel at about 18 rad/s with no load, so $$|v_l|, |v_r| \le 0.63$$ m/s. In terms of the body:

$$|v| + \frac{L}{2}\,|\omega| \le v_{\max}.$$

That's a diamond in the $$(v, \omega)$$ plane: the robot can go straight at 0.63 m/s, spin at $$2 \times 0.63 / 0.22 = 5.7$$ rad/s, or anything in between, but not both at full speed. If a planner asks for more, the controller has to scale both down together, keeping the ratio, or the robot will follow a different curve from the one planned.

### Why the midpoint is so much better

Over a step, the true heading sweeps from $$\theta$$ to $$\theta + \Delta\theta$$. Euler uses the heading at the start for the whole step, so its error is first order: half the step's turn, every step. The midpoint uses the average heading, so the first-order error cancels and only a second-order one is left. For $$\Delta\theta$$ small, the exact arc's chord points exactly along $$\theta + \Delta\theta/2$$, and is only shorter than the arc by a factor $$\operatorname{sinc}(\Delta\theta/2) \approx 1 - \Delta\theta^2/24$$. That's why the green path above barely moves.

## Further reading

- R. Siegwart, I. Nourbakhsh and D. Scaramuzza, [_Introduction to Autonomous Mobile Robots_](https://mitpress.mit.edu/9780262015356/introduction-to-autonomous-mobile-robots/), chapter 3: kinematics of every common wheel type.
- G. Dudek and M. Jenkin, [_Computational Principles of Mobile Robotics_](https://doi.org/10.1017/9781108682404) (3rd ed., 2024), chapter 2.
- ROS 2 Control, [`diff_drive_controller`](https://control.ros.org/master/doc/ros2_controllers/diff_drive_controller/doc/userdoc.html): the standard implementation, with wheel separation and radius as parameters.
- K. Lynch and F. Park, [_Modern Robotics_](http://hades.mech.northwestern.edu/index.php/Modern_Robotics), chapter 13: wheeled mobile robots, holonomic and nonholonomic.

{% include mr-series.liquid %}
