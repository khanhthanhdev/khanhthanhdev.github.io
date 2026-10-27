---
layout: post
title: "mobile robots from scratch, part 7: the onboard computer, Raspberry Pi and Jetson"
date: 2026-10-27 00:00:00 +0700
description: what a robot's main computer runs, how small delays add up between seeing an obstacle and reacting to it, what that costs in stopping distance, what happens when a program can't keep up, and how to choose between a Raspberry Pi and a Jetson
tags: robotics raspberry-pi jetson interactive
categories: explainer
series: mobile-robots-from-scratch
part: 7
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
  - /assets/js/mobile-robot/part7.js
  - /assets/js/mobile-robot/mr-scrolly.js
---

{% include mr-series.liquid %}

[Part 6]({% post_url 2026-10-27-mr-6-the-microcontroller-esp32 %}) gave the robot a microcontroller to keep the wheels on time. Everything else, the lidar, the camera, the map, the plan, runs on a full computer: usually a **Raspberry Pi** or an NVIDIA **Jetson**. This part is about what that computer has to do, and the one number that matters more than its speed: how long it takes to react.

## Thinking in time, step by step

<section class="tf-scrolly" data-mr-scene="part7">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="jobs" data-title="What the computer runs." markdown="1">
**A robot's software is a crowd of small programs**, each doing one job and passing messages to the others. In ROS 2 (part 10) they're called **nodes**.

A lidar driver publishes a scan ten times a second. A camera driver publishes 30 frames a second. One node fuses odometry with the IMU; another works out where the robot is on its map; a planner picks a route; a controller turns the route into wheel speeds 20 times a second and sends them down to the ESP32.

They all run at once, on a computer with four to fourteen CPU cores, and, on a Jetson, a GPU for the neural networks.

</div>

<div class="tf-step" data-step="chain" data-title="From seeing to reacting." markdown="1">
**Suppose a box appears in front of the robot.** How long before the wheels respond? Add up the steps, with plausible times for a small robot:

- A lidar scan takes 100 ms to sweep round, so on average the box was seen **50 ms** before the scan is finished.
- It travels over USB (2 ms), then localisation processes it, here **30 ms**.
- The controller runs every 50 ms, so the result waits about 25 ms on average.
- Serial to the ESP32 takes a few ms, and then the motor needs its time constant, 120 ms (part 5), to change speed.

That's **232 ms**. At 0.5 m/s the robot drives 12 cm before it starts to react. Slide the localisation time up to see a slow computer's cost.

</div>

<div class="tf-step" data-step="stopping" data-title="Latency is distance." markdown="1">
**The distance to stop** is the distance covered while nothing happens yet, plus the braking distance:

$$d = v\,t_{\text{lat}} + \frac{v^2}{2a}.$$

At 0.5 m/s, braking at 1 m/s², the robot needs 15 cm with 50 ms of latency, 24 cm with 232 ms, and 38 cm with 500 ms. At 1 m/s these become 55, 73 and 100 cm.

The braking term grows with the square of the speed, the latency term only with the speed. So at low speed, latency is a large share of the stopping distance. Whatever the speed, every 100 ms of delay costs $$v \times 0.1$$ s of extra distance. This is what sets the safety margin around the robot (part 15), and why a robot's top speed is often limited by how fast its computer reacts, not by its motors.

</div>

<div class="tf-step" data-step="queue" data-title="When a node can't keep up." markdown="1">
**A camera sends 30 frames a second**, one every 33 ms. If processing a frame takes 25 ms, every frame is done before the next arrives: each result is 25 to 30 ms old.

Now make it 40 ms. The node falls behind by 7 ms every frame. If it keeps every frame in a queue, the queue grows without end: after 10 seconds, the result it produces is about a frame from **2.1 seconds ago**. It's fully busy, and completely useless.

If it keeps only the newest frame and drops the rest, it processes 249 of the 300 frames, and each result is about 57 ms old. For a robot, a fresh answer beats a complete one. In ROS 2 this is a queue **depth** of 1 (part 10).

</div>

<div class="tf-step" data-step="power" data-title="The computer drains the battery too." markdown="1">
**A small robot's motors don't use much power** on a flat floor: assume 6 W. Its computer can use more. With a 55.5 Wh battery (3 lithium cells, 5 Ah), a computer drawing 7 W leaves 4.3 hours of running time; at 25 W, 1.8 hours; at 60 W, 50 minutes.

At 15 W the computer uses 71% of the energy. That's why the choice of computer is a trade: more compute means more perception, and less time between charges. Jetsons let you pick a **power mode** (the Orin Nano: 7, 15 or 25 W) to make that trade.

</div>

  </div>
</section>

## Choosing a computer

As of October 2026, these are the usual choices. The figures are the makers' own.

{: .tf-table}
| | Raspberry Pi 5 | Jetson Orin Nano Super | Jetson AGX Thor |
| ------- | --------------------- | ------------------------- | ------------------------ |
| CPU | 4 × Cortex-A76, 2.4 GHz | 6 × Cortex-A78AE, 1.7 GHz | 14 × Neoverse-V3AE |
| GPU | for graphics only | 1,024 CUDA cores | 2,560-core Blackwell |
| memory | up to 16 GB | 8 GB | 128 GB |
| power | 27 W supply | 7, 15 or 25 W modes | 40 to 130 W |

The **Raspberry Pi 5** is the default for small robots: cheap, well documented, with good USB and camera support, and it runs ROS 2 well. It has no usable GPU for neural networks, but an AI accelerator can be added: Raspberry Pi's AI HAT+, with a Hailo chip, rated at 13 or 26 TOPS.

The **Jetson Orin Nano Super** developer kit ($249 at launch) adds a real GPU, rated by NVIDIA at 67 TOPS (sparse INT8), for running object detectors and depth networks on board. It runs NVIDIA's JetPack Linux and their accelerated ROS 2 packages (Isaac ROS).

The **Jetson AGX Thor** ($3,499 at launch) is for humanoids and large robots running big neural networks on board: 2,070 TFLOPS of sparse FP4 compute.

Two warnings about the numbers. **TOPS** are peak operations per second, at low precision, often counting sparsity; real networks get a fraction of that, so compare published benchmarks of the model you'll run. And prices move: retail prices have varied widely since launch, so check current ones.

## What's still missing

- **The sensors that need all this compute.** The lidar comes next, in parts 8 and 9, and the depth camera in part 11.
- **How the nodes talk**, and what a queue depth is: part 10.

## Going deeper

### Measuring latency

Don't guess latency: measure it. ROS 2 messages carry a timestamp of when the data was captured (`header.stamp`). The age of a message when it's used is `now - header.stamp`, and logging it at each node shows where the time goes. Two things are needed for that to work: the clocks on the computer and any other boards must agree (NTP or PTP), and drivers must stamp the capture time, not the time the message was sent.

### Why a full queue is worse than an empty one

A queue that fills faster than it drains is a **queueing** problem. With frames arriving every $$T$$ and processing taking $$p > T$$, the backlog grows by $$(p - T)/T$$ frames per frame, and the wait grows by $$p - T$$ per frame: here $$40 - 33.3 = 6.7$$ ms. After 300 frames, that's about 2 seconds. Even when $$p$$ is a little less than $$T$$ on average, random variation makes the queue grow when processing is slow and shrink slowly afterwards: the closer the average load gets to 100%, the longer the waits. Leave headroom.

### Real-time Linux

On a computer that runs both the controller and heavy perception, the perception can delay the controller. Three fixes, in order of effort: give the control node a higher priority (`chrt` or the executor's thread settings); pin it to a CPU core of its own; use a `PREEMPT_RT` kernel, which bounds how long any task can be kept waiting.

## Further reading

- Raspberry Pi, [Raspberry Pi 5 product brief](https://www.raspberrypi.com/products/raspberry-pi-5/): the board's specifications.
- NVIDIA, [Jetson Orin Nano Super developer kit](https://developer.nvidia.com/blog/nvidia-jetson-orin-nano-developer-kit-gets-a-super-boost/) (December 2024): the specifications and power modes.
- NVIDIA, [Jetson Thor](https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-thor/): the AGX Thor module and developer kit.
- [ros2_tracing](https://github.com/ros2/ros2_tracing): tools to trace and measure latency through a ROS 2 system.

{% include mr-series.liquid %}
