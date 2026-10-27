---
layout: post
title: "mobile robots from scratch, part 15: path planning and navigation"
date: 2026-10-27 00:00:00 +0700
description: how a robot gets from here to there on its map; costmaps and inflation, A* compared with Dijkstra, how much a planner should fear obstacles, following the plan with pure pursuit, replanning when the way is blocked, and how Nav2 puts it all together
tags: robotics planning navigation algorithms interactive
categories: explainer
series: mobile-robots-from-scratch
part: 15
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
  - /assets/js/mobile-robot/part15.js
  - /assets/js/mobile-robot/mr-scrolly.js
---

{% include mr-series.liquid %}

The robot now has a map ([part 14]({% post_url 2026-10-27-mr-14-slam %})) and knows where it is on it ([part 13]({% post_url 2026-10-27-mr-13-particle-filters %})). The last question is the one it was built for: how does it get somewhere? Someone clicks a goal on the far side of the dividing wall. The robot must find a route that doesn't hit anything, then drive along it, and cope when something gets in the way.

That splits into two jobs. A **planner** finds a path through the map, once. A **controller** follows it, many times a second.

## From here to there, step by step

<section class="tf-scrolly" data-mr-scene="part15">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="costmap" data-title="Where the robot may go." markdown="1">
**The planner doesn't use the map directly.** The robot isn't a point: it's 36 cm across. So it plans on a **costmap**, a grid of 10 cm cells where each says how bad it is for the robot's centre to be there.

Any cell closer to an obstacle than the robot's radius, 18 cm, is **lethal** (dark): the robot would touch something. Beyond that, an **inflated** band (orange) costs less and less, out to 50 cm more, so paths prefer to keep away from walls without being forbidden from going near them:

$$c(d) = 0.9\, e^{-3 (d - r) / 0.5}.$$

Of the room's 6,000 cells, 1,371 are lethal and 2,446 inflated. The robot is in the corner (blue); the goal is the red dot behind the wall.

</div>

<div class="tf-step" data-step="search" data-title="Searching the grid: A*." markdown="1">
**Dijkstra's algorithm** finds the cheapest path by exploring outward from the start, always taking the cheapest unexplored cell next, until it reaches the goal. Choose it and scroll: it explores 3,905 cells, in every direction, including away from the goal.

**A\*** adds a guess of how far each cell still is from the goal, its straight-line distance $$h$$, and explores the cell with the smallest cost so far plus guess:

$$f = g + h.$$

It finds the same 10.20 m path after exploring 2,103 cells. Because the straight line is never longer than the real route, A\* is still guaranteed to find the cheapest path.

Multiply the guess by 3 and the search rushes at the goal: 525 cells. But the guess now overestimates, the guarantee is gone, and the path it finds costs 10% more, squeezing past the box.

</div>

<div class="tf-step" data-step="weight" data-title="How much to fear obstacles." markdown="1">
**Each move costs its length times $$1 + w \cdot c$$**, where $$c$$ is the cell's cost and $$w$$ says how much the planner cares. Slide it.

At 0, only length counts: the shortest path, 8.91 m, but it skims the box and the wall with no gap at all. One bump of the localisation, and the robot hits them. At 1, the path is 9.11 m and keeps 14 cm away. At 4, 10.20 m, and 47 cm: it goes down the middle of every gap. Beyond that, nothing changes much, since the path is already as far from things as the room allows.

A good plan is not the shortest one. It's the shortest one the robot can follow safely, with the errors it has.

</div>

<div class="tf-step" data-step="follow" data-title="Following the plan: pure pursuit." markdown="1">
**The path is a list of cells; the motors want speeds.** The controller turns one into the other. **Pure pursuit** is the simplest that works: find the point on the path one **lookahead** distance ahead of the robot, and drive the circular arc that reaches it. For a point at $$(x, y)$$ in the robot's frame, that arc has curvature

$$\kappa = \frac{2y}{x^2 + y^2},$$

so the robot turns at $$\omega = v\kappa$$ (part 2's kinematics give the wheel speeds).

With a lookahead of 0.4 m, the robot (blue) stays 3.8 cm from the path on average, 9.1 cm at worst, and arrives in 32.4 s. Slide it longer: at 1.2 m it looks so far ahead that it cuts the corners, 37.4 cm off at worst, which on this plan eats most of the gap the planner left. Shorter tracks tighter, but on a real robot, with delays and wheel slip, too short a lookahead makes it weave.

</div>

<div class="tf-step" data-step="replan" data-title="Something in the way." markdown="1">
**Maps go out of date.** The robot is 4.25 m along its 10.20 m path when its lidar sees a chair that wasn't there when the map was made. Press the button.

The lidar's points go into the costmap as new obstacles, and the chair stands right where the old plan (red, dashed) went round the end of the wall. The planner runs again from where the robot is: a new path of 7.73 m, wider round the chair and between it and the pillar, 11.98 m in all. It found that by exploring 1,330 cells, in a few milliseconds here.

Real navigation replans like this all the time, about once a second, whether anything has changed or not.

</div>

  </div>
</section>

## Navigation in ROS 2: Nav2

ROS 2's navigation stack, **Nav2**, is built from the same parts, each a node with plugins to choose from:

{: .tf-table}
| part | what it does | choices include |
| -------------------- | ----------------------------- | ----------------------------- |
| costmaps | static map, sensors, inflation | layers: static, obstacle, voxel |
| planner server | the whole path, about 1 Hz | NavFn, Smac (A\*, Hybrid-A\*), Theta\* |
| controller server | wheel commands, 20 Hz or more | Regulated Pure Pursuit, DWB, MPPI |
| behaviour tree | when to plan, follow, recover | the BT navigator |

There are two costmaps. The **global** one covers the whole map from part 14, with the lidar's obstacles added, for the planner. The **local** one is a few metres round the robot, updated fast from the sensors, for the controller.

A **behaviour tree** ties them together: plan, follow, and replan on a timer; if the robot is stuck, clear the costmaps, spin on the spot, back up, wait, and try again. Running the whole thing takes AMCL (part 13) for `map → odom`, the EKF (part 12) for `odom → base_link`, a lidar driver, and a goal clicked in RViz.

## The whole robot

That's the end of the series, and the whole stack. Wheels and their kinematics (part 2) driven by motors under PID control (part 5), from an ESP32 (part 6) that counts encoder ticks into odometry (part 4). A Pi or Jetson (part 7) running ROS 2 (part 10), with a lidar (parts 8 and 9) and a depth camera (part 11). The EKF fuses wheels and IMU (part 12); SLAM builds the map (part 14); AMCL finds the robot on it (part 13); and Nav2 plans and drives it to the goal.

Each layer only works because the one under it is honest about its errors.

## Going deeper

### Planning for a robot that can't turn on the spot

A\* on a grid assumes the robot can go from any cell to its neighbour. A differential drive can, roughly; a car can't, because it can't turn on the spot. **Hybrid-A\*** searches over $$(x, y, \theta)$$ with moves that are short arcs the vehicle can really drive, and **state lattice** planners use precomputed motion primitives. Nav2's Smac planner offers both.

### Smarter controllers

Pure pursuit only follows the path. **DWB** (the dynamic window approach) samples many speed pairs, simulates each a second or two ahead, and scores them against the path, the goal and the local costmap. **MPPI** samples thousands of noisy trajectories and averages them, weighted by cost. Both can dodge obstacles the global plan didn't know about without replanning. **Regulated pure pursuit**, Nav2's version of this page's controller, slows down in tight turns and near obstacles.

### Sampling-based planners

On a grid, the number of cells grows with the size of the map, and much faster with the dimensions: a robot arm with seven joints can't be gridded at all. **RRT** and **PRM** sample random states instead and connect the ones that can reach each other; **RRT\*** keeps improving the path as it samples more. For a mobile robot on a 2-D map, grid search is usually faster and simpler.

## Further reading

- E. W. Dijkstra, [_A note on two problems in connexion with graphs_](https://doi.org/10.1007/BF01386390) (Numerische Mathematik, 1959): the shortest-path algorithm.
- P. E. Hart, N. J. Nilsson and B. Raphael, [_A formal basis for the heuristic determination of minimum cost paths_](https://doi.org/10.1109/TSSC.1968.300136) (1968): A\*.
- R. C. Coulter, [_Implementation of the pure pursuit path tracking algorithm_](https://www.ri.cmu.edu/pub_files/pub3/coulter_r_craig_1992_1/coulter_r_craig_1992_1.pdf) (CMU, 1992).
- S. Macenski, F. Martín, R. White and J. Ginés Clavero, [_The Marathon 2: a navigation system_](https://doi.org/10.1109/IROS45743.2020.9341207) (IROS 2020): Nav2's design.
- S. Macenski, S. Singh, F. Martín and J. Ginés, [_Regulated pure pursuit for robot path tracking_](https://doi.org/10.1007/s10514-023-10097-6) (Autonomous Robots, 2023).
- [Nav2 documentation](https://docs.nav2.org/): setting it up on your own robot, with tutorials.

{% include mr-series.liquid %}
