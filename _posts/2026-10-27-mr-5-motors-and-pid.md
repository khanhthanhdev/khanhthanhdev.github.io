---
layout: post
title: "mobile robots from scratch, part 5: motors and PID control"
date: 2026-10-27 00:00:00 +0700
description: how a DC motor's speed follows its voltage, how PWM makes a voltage out of a switch, why a fixed command fails under load, and how the P, I and D terms of a PID controller make a wheel hold its speed
tags: robotics control motors interactive
categories: explainer
series: mobile-robots-from-scratch
part: 5
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
  - /assets/js/mobile-robot/part5.js
  - /assets/js/mobile-robot/mr-scrolly.js
---

{% include mr-series.liquid %}

[Part 2]({% post_url 2026-10-27-mr-2-wheels-and-kinematics %}) turned a wanted motion into two wheel speeds, and [part 4]({% post_url 2026-10-27-mr-4-encoders-and-odometry %}) measured the speeds the wheels really have. This part connects the two: a **controller** that keeps adjusting each motor's power until the wheel turns at the speed it was asked for, whatever the floor does to it.

## Holding a speed, step by step

<section class="tf-scrolly" data-mr-scene="part5">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="dcmotor" data-title="A motor's speed follows its voltage, slowly." markdown="1">
**A brushed DC motor turns faster the more voltage it gets.** With no load, its top speed is roughly proportional to the voltage: our gear motor turns the wheel at 18 rad/s (0.63 m/s) at full power, 9 at half and 4.5 at a quarter.

It doesn't get there at once. The motor and wheel have inertia, so the speed climbs along a curve, reaching 63% of its final value after one **time constant** $$\tau$$, here 0.12 s, and about 95% after three. A good model for this is

$$\tau\,\dot\omega = K u - \omega,$$

with $$u$$ the share of full power, from 0 to 1, and $$K = 18$$ rad/s the top speed. Every curve in this part comes from this equation.

</div>

<div class="tf-step" data-step="pwm" data-title="PWM: a voltage from a switch." markdown="1">
**A microcontroller can't output 6 V.** Its pins are on or off. So it switches the motor's full 12 V supply on and off very fast: **pulse-width modulation** (PWM). The share of each period the switch is on is the **duty cycle**.

At 20 kHz, one period is 50 µs, far shorter than the motor's 0.12 s time constant. The motor can't follow the individual pulses, and responds to their average: 50% duty acts like 6 V. (20 kHz is also above what people can hear, so the motor doesn't whine.)

The switching is done by an **H-bridge**, a chip of four transistors such as the TB6612FNG or DRV8833, which can also reverse the current to drive the motor backwards. Move the slider.

</div>

<div class="tf-step" data-step="open" data-title="Open loop: a fixed command." markdown="1">
**The simplest controller does the arithmetic once.** To turn the wheel at 10 rad/s, set the duty to $$10 / 18 = 55.6\%$$. This is **open-loop** control: the command never looks at what the wheel actually does.

On a flat floor it works: the wheel reaches 10.00 rad/s. Then at 1 s the robot meets a load (a slope, a rug, a heavier battery), which here costs 4 rad/s. The wheel slows to **6.00 rad/s** and stays there. Nothing told the controller.

Both wheels see different loads, so an open-loop robot doesn't even drive straight. It also can't cope with a battery running down, which lowers every speed.

</div>

<div class="tf-step" data-step="p" data-title="P: push in proportion to the error." markdown="1">
**Close the loop.** Every 10 ms, measure the wheel's speed with the encoder, compute the **error** $$e = \omega_{\text{target}} - \omega$$, and set

$$u = K_p\, e.$$

Far below the target, push hard; close to it, push gently. With $$K_p = 0.1$$ the wheel settles at 6.43 rad/s, not 10, and the load still drags it down to 5.00.

That shortfall is built in. A P controller only pushes when there's an error, so it needs an error to hold any speed at all. Raise $$K_p$$ and the error shrinks: at 1.0 the wheel reaches 9.47 rad/s, and holds 9.26 under load. But raise it past about 1.4 and every 10 ms correction overshoots the last: the speed rattles and the duty slams between full and zero. Try it.

</div>

<div class="tf-step" data-step="pi" data-title="I: remember the error." markdown="1">
**Add a term that adds up the error over time**, the **integral**:

$$u = K_p\, e + K_i \int e\, dt.$$

As long as the wheel is too slow, the integral keeps growing and the push keeps rising, until the error is exactly zero. Then the integral holds the duty the motor needs, without any error.

With $$K_p = 0.1$$ and $$K_i = 1$$, the wheel reaches 90% of its target in 0.14 s, with almost no overshoot. When the load arrives, it dips to 8.95 rad/s, and the integral pulls it back to 10 within a third of a second.

Push $$K_i$$ higher and it recovers faster, but overshoots: 6% at $$K_i = 2$$. This **PI** controller is what almost every motor speed loop runs.

</div>

<div class="tf-step" data-step="pid" data-title="D: react to the trend, and to the noise." markdown="1">
**The third term looks at how fast the speed is changing**, the **derivative**, and pushes against it, braking a fast rise before it overshoots:

$$u = K_p\, e + K_i \int e\, dt - K_d\, \frac{d\omega}{dt}.$$

(Taking the derivative of the measured speed rather than of the error means a sudden new target doesn't make the output jump.)

Here it barely helps: a motor speed loop is already smooth. And it has a cost. The measured speed is noisy: with 1,320 counts per turn, one count in a 10 ms cycle is 0.48 rad/s. The derivative amplifies that noise. With noise of 0.5 rad/s, the PI controller's duty jitters by 5.0%; with $$K_d = 0.002$$ it jitters by 19.2%, and with 0.005 by 39.5%, heating the motor for nothing.

The D term earns its place in **position** loops, like a robot arm's joint or a balancing robot, where the thing controlled has momentum to brake.

</div>

<div class="tf-step" data-step="windup" data-title="Windup: when the integral runs away." markdown="1">
**The wheel gets stuck**, against a doorstep, from 0.5 to 1 s. The error is large, the duty is already at 100%, and it can't go higher. But the integral doesn't know that: it keeps adding up the error, **winding up** a huge store of push.

When the wheel comes free, that store has to be unwound before the duty comes off full. Without protection the wheel shoots to **17.96 rad/s**, nearly twice the target, and only settles back within 5% of it at 2.08 s.

The fix is **anti-windup**: stop integrating while the output is saturated. With it, the wheel peaks at 10.60 rad/s and is back within 5% at 1.26 s. Press the button to compare.

</div>

  </div>
</section>

## PID in code

This is the controller the figures run, once per wheel, every 10 ms:

```python
KP, KI, KD = 0.1, 1.0, 0.0
DT = 0.01
integral = 0.0
last_speed = 0.0

def control(target, speed):
    global integral, last_speed
    error = target - speed
    derivative = -(speed - last_speed) / DT    # on the measurement, not the error
    last_speed = speed
    trial = integral + error * DT
    u = KP * error + KI * trial + KD * derivative
    if -1 < u < 1:                             # anti-windup: integrate only when not saturated
        integral = trial
    u = KP * error + KI * integral + KD * derivative
    return max(-1.0, min(1.0, u))              # the duty for the H-bridge
```

The speed comes from the encoder counts of part 4: counts in the last cycle, divided by 1,320 counts per turn and by `DT`, times $$2\pi$$. On real hardware this runs on the microcontroller, not the main computer, because it has to run on time, every time: that's part 6.

## Tuning by hand

There are formal methods (below), but most robot speed loops are tuned like this:

1. Set $$K_i = K_d = 0$$. Raise $$K_p$$ until the wheel responds briskly to a step in target, then halve it, well away from where it starts to rattle.
2. Raise $$K_i$$ until the steady error disappears quickly enough, and back off if it overshoots more than you'd like.
3. Leave $$K_d$$ at zero unless something oscillates that $$K_p$$ and $$K_i$$ can't fix, and filter the measurement before you differentiate it.

Test under load, at low speed (where the encoder gives few counts per cycle) and with the battery low.

## What's still missing

- **The loop has to run every 10 ms, without fail, while counting thousands of encoder edges a second.** Part 6 does that on an ESP32.
- **A wheel speed is not a robot speed.** The `/cmd_vel` twist of part 2 is turned into two wheel targets, each with its own PID loop. ROS 2's `ros2_control` organises exactly this (part 10).

## Going deeper

### Why P alone falls short

In the steady state, $$\dot\omega = 0$$, so the motor model gives $$\omega = K u - L$$ for a load $$L$$. With $$u = K_p(\omega_t - \omega)$$:

$$\omega = \frac{K K_p\, \omega_t - L}{1 + K K_p}.$$

For $$K K_p = 1.8$$, that's $$(18 - 4)/2.8 = 5.0$$ rad/s under load and $$18/2.8 = 6.43$$ without. The error shrinks like $$1/(1 + K K_p)$$ but never reaches zero. An integral term adds a pole at zero frequency, which makes the steady error zero for any constant target and load.

### Why a big Kp rattles

The controller holds its output for 10 ms between updates. Over that time, the motor closes a fraction $$1 - a$$ of the gap to its new speed, with $$a = e^{-dt/\tau} = 0.92$$. One update after a speed error $$e$$, the error left is $$\big(a - K K_p (1 - a)\big) e$$. The loop is stable only if that factor stays between −1 and 1:

$$K_p < \frac{1 + a}{K\,(1 - a)} = \frac{1.92}{18 \times 0.08} = 1.33.$$

Above it, each correction overshoots by more than the error it fixed. A faster loop (smaller $$dt$$) moves that limit up; a delay in the measurement moves it down. That's why control loops run on fast, predictable hardware.

### Ziegler–Nichols and feedforward

The classic **Ziegler–Nichols** method raises $$K_p$$ alone until the loop just oscillates, measures that gain $$K_u$$ and the oscillation's period $$T_u$$, and sets $$K_p = 0.45 K_u$$ and $$K_i = 0.54 K_u / T_u$$ for a PI controller. It tends to give aggressive, overshooting loops: a starting point, not an answer.

Good controllers also add **feedforward**: the open-loop guess $$\omega_t / K$$ is added to the PID output, so the PID only has to correct what the model got wrong. The response is faster and the integral has less to do.

## Further reading

- K. J. Åström and R. M. Murray, [_Feedback Systems: An Introduction for Scientists and Engineers_](https://fbswiki.org/wiki/index.php/Feedback_Systems:_An_Introduction_for_Scientists_and_Engineers) (2nd ed., free online), chapter 11: PID control, windup and tuning.
- B. Beauregard, [_Improving the beginner's PID_](http://brettbeauregard.com/blog/2011/04/improving-the-beginners-pid-introduction/) (2011): a step-by-step walk from the textbook formula to a robust implementation, including derivative-on-measurement and anti-windup.
- J. G. Ziegler and N. B. Nichols, [_Optimum settings for automatic controllers_](https://doi.org/10.1115/1.4019264) (1942): the original tuning rules.
- [`ros2_control`](https://control.ros.org/): how ROS 2 organises hardware interfaces and controllers, including the PID controller and `diff_drive_controller`.

{% include mr-series.liquid %}
