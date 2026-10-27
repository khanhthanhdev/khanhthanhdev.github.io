---
layout: post
title: "mobile robots from scratch, part 8: lidar, how it measures"
date: 2026-10-27 00:00:00 +0700
description: how a lidar measures distance with light, by timing a pulse, by triangulating with a camera, or by the phase of a modulated beam; why triangulation gets worse with the square of the distance; how a spinning head makes a scan; and the kinds of lidar there are
tags: robotics lidar sensors interactive
categories: explainer
series: mobile-robots-from-scratch
part: 8
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
  - /assets/js/mobile-robot/part8.js
  - /assets/js/mobile-robot/mr-scrolly.js
---

{% include mr-series.liquid %}

Every robot so far has known only how its wheels turned. To find out where it really is, and what's in its way, it needs to measure the room. The sensor most mobile robots use for that is a **lidar** (light detection and ranging): it measures the distance to whatever a laser beam hits, hundreds or thousands of times a second, in every direction.

This part is about how one distance is measured, and how many of them become a scan. [Part 9]({% post_url 2026-10-27-mr-9-lidar-processing-a-scan %}) is about what the robot does with the scan.

## Measuring with light, step by step

<section class="tf-scrolly" data-mr-scene="part8">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="tof" data-title="Time of flight: time the echo." markdown="1">
**The direct way to measure a distance with light** is to send a short pulse and time how long it takes to come back. Light covers the distance twice, there and back, so

$$d = \frac{c\,t}{2}.$$

Light is fast: a wall 4 m away sends the pulse back after 26.7 ns. To measure to 1 cm, the lidar has to time the echo to **67 ps**, which is why time-of-flight lidars have special timing electronics. This is **direct time of flight** (dToF).

The echo also gets weaker with distance, roughly as $$1/d^2$$ for a wall: at 4 m it's 16 times weaker than at 1 m. The range a lidar can reach is set by when the echo sinks into the noise, and depends on how much light the surface reflects.

</div>

<div class="tf-step" data-step="triangulation" data-title="Triangulation: a laser and a camera." markdown="1">
**Cheap lidars often don't time anything.** They shine a laser dot, and a small camera a few centimetres to the side sees where the dot lands. A near wall puts the dot at one edge of the camera's image, a far one near the centre. The geometry is a triangle, like the stereo cameras of part 11:

$$z = \frac{f\,b}{x},$$

with $$b$$ the **baseline** between laser and camera, $$f$$ the camera's focal length in pixels and $$x$$ where the dot lands.

The catch is that the error grows with the **square** of the distance. With a 5 cm baseline and the dot located to a tenth of a pixel, the error is 0.3 cm at 1 m, 2.6 cm at 3 m and 18.3 cm at 8 m. Time of flight's error stays about the same (here 1.5 cm, for 100 ps of timing jitter). Move the baseline: a wider one helps, but makes the sensor bigger.

</div>

<div class="tf-step" data-step="phase" data-title="Phase shift: the wave comes back late." markdown="1">
**Another way avoids timing a short pulse.** Make the light's brightness rise and fall smoothly, at a frequency $$f$$, and compare the wave that comes back with the one sent out. The echo is delayed, so its wave is shifted, by a phase

$$\varphi = \frac{4\pi f d}{c}.$$

Measuring a phase is easier than timing picoseconds. This is **amplitude-modulated continuous wave** (AMCW), used in many depth cameras.

But a phase repeats every full turn. At 10 MHz the wave repeats every 15 m, so a wall at 16 m reads as **1.01 m**. A higher frequency measures more finely but repeats sooner: at 100 MHz, every 1.5 m. Real sensors combine two or more frequencies to tell the cases apart.

</div>

<div class="tf-step" data-step="spin" data-title="Spinning: one distance becomes a scan." markdown="1">
**One distance isn't a picture.** So a 2-D lidar puts its range finder on a turning head, and takes ranges as it goes round. This one takes 4,000 a second and turns 10 times a second: 400 points a turn, 0.9° apart.

That spacing is in angle, so the points spread out with distance: 7.9 cm apart on a wall 5 m away. Spin faster and the scan is fresher but sparser. At 20 Hz, 200 points, 15.7 cm apart at 5 m; at 5 Hz, 800 points, but each scan is 0.2 s old by the time it's finished (part 9 deals with that).

All the points lie in one flat slice of the room, at the height of the lidar. A table top above it, or a chair leg below it, is invisible.

</div>

<div class="tf-step" data-step="holes" data-title="Holes in the scan." markdown="1">
**Not every beam comes back.** Black surfaces absorb most of the light. Glass lets it through, and a mirror sends it elsewhere. A wall hit at a very glancing angle scatters too little light back. And past its maximum range, the lidar hears nothing.

So a real scan has gaps and noisy points. Drivers report a missing return as "no reading" (in ROS, `inf` or a range outside the valid limits), and every algorithm downstream has to cope with that. A missing reading isn't the same as free space: the glass door is still there.

</div>

<div class="tf-step" data-step="kinds" data-title="Kinds of lidar." markdown="1">
**A 2-D spinning lidar** is what most indoor robots use: a few tens to a few hundred dollars, one flat slice, good enough for mapping and localisation on a flat floor.

**3-D lidars** stack many beams, 16 to 128, on one spinning head, each at a different tilt, giving a 3-D point cloud. They're what self-driving cars and outdoor robots use. Others point the beam with no spinning head: a tiny tilting **MEMS** mirror, a **flash** of light over the whole scene read by a sensor of pixels, or an **optical phased array** that steers the beam electronically. These are called **solid-state**.

All of them measure range in the ways above.

</div>

  </div>
</section>

## Lidars you'll meet

{: .tf-table}
| type | ranges by | examples |
| -------------- | -------------- | ------------------------------- |
| 2-D, low cost | triangulation | RPLIDAR A1 |
| 2-D | time of flight | LDROBOT LD06, RPLIDAR S2 |
| 3-D spinning | time of flight | Ouster, Hesai, Velodyne |
| 3-D, prism scan | time of flight | Livox |
| 3-D, FMCW | frequency chirp | Aeva |

For a small indoor robot, a 2-D time-of-flight lidar is the usual choice: it costs little more than a triangulation one, and its error doesn't grow so fast with distance. Check three numbers on any datasheet: the **range** (on dark surfaces, not just white ones), the **sample rate** (points per second), and the **scan rate** (turns per second).

## What's still missing

- **The scan is a list of numbers.** Turning it into points, lines and a motion estimate is [part 9]({% post_url 2026-10-27-mr-9-lidar-processing-a-scan %}).
- **One slice isn't enough** to see a table top or a step down. [Part 11]({% post_url 2026-10-27-mr-11-depth-cameras %})'s depth cameras see in 3-D.

## Going deeper

### Why triangulation error grows as distance squared

Differentiate $$z = fb/x$$ with respect to $$x$$:

$$\frac{dz}{dx} = -\frac{fb}{x^2} = -\frac{z^2}{fb}.$$

So an error $$\delta x$$ in locating the dot gives a range error $$\delta z = z^2 \delta x / (fb)$$. Double the distance and the dot moves a quarter as far for the same change in depth. Stereo cameras (part 11) have exactly the same problem, for the same reason.

### FMCW: measuring speed too

**Frequency-modulated continuous wave** (FMCW) lidar sweeps the light's frequency up in a ramp, a **chirp**, and mixes the echo with the light being sent. Because the echo left a little earlier, it's at a slightly different frequency, and the two beat together at a frequency proportional to the distance: $$f_b = 2 d S / c$$ for a chirp that rises at $$S$$ hertz per second. If the target is moving, the Doppler effect shifts the beat too, so one measurement gives both distance and speed. FMCW also ignores sunlight and other lidars, since only light matching its own chirp beats with it.

### Eye safety

Lidars for people's homes and workplaces must be **Class 1**: safe under all normal use, even looking into the beam. Most use near-infrared light at 905 nm, where the eye focuses light onto the retina, so the power is tightly limited. Some long-range lidars use 1,550 nm, which water in the eye absorbs before it reaches the retina, so they can send far more power and see further.

## Further reading

- R. Siegwart, I. Nourbakhsh and D. Scaramuzza, [_Introduction to Autonomous Mobile Robots_](https://mitpress.mit.edu/9780262015356/introduction-to-autonomous-mobile-robots/), chapter 4: range sensors, time of flight, phase shift and triangulation.
- K. Konolige et al., [_A low-cost laser distance sensor_](https://doi.org/10.1109/ROBOT.2008.4543666) (ICRA 2008): the design of the triangulation lidar in the Neato vacuum, and its error.
- B. Behroozpour et al., [_Lidar system architectures and circuits_](https://doi.org/10.1109/MCOM.2017.1700030) (IEEE Communications Magazine, 2017): a survey of time-of-flight, AMCW and FMCW lidar.
- ROS, [`sensor_msgs/LaserScan`](https://docs.ros.org/en/rolling/p/sensor_msgs/msg/LaserScan.html): how a scan is represented, including invalid readings.

{% include mr-series.liquid %}
