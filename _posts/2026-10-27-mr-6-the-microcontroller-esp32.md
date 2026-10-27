---
layout: post
title: "mobile robots from scratch, part 6: the microcontroller, ESP32"
date: 2026-10-27 00:00:00 +0700
description: why a robot splits its work between a computer and a microcontroller, three ways an ESP32 can count encoder edges and when each fails, why a control loop must keep time, and how much a serial link to ROS 2 can carry
tags: robotics esp32 embedded interactive
categories: explainer
series: mobile-robots-from-scratch
part: 6
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
  - /assets/js/mobile-robot/part6.js
  - /assets/js/mobile-robot/mr-scrolly.js
---

{% include mr-series.liquid %}

[Part 4]({% post_url 2026-10-27-mr-4-encoders-and-odometry %}) counted encoder edges and [part 5]({% post_url 2026-10-27-mr-5-motors-and-pid %}) ran a PID loop every 10 ms. Both assumed something quietly: that no edge is ever missed, and that 10 ms is always 10 ms. This part is about the chip that makes those assumptions true, the **microcontroller**, using the popular ESP32 as the example.

## Keeping time, step by step

<section class="tf-scrolly" data-mr-scene="part6">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="split" data-title="Two computers, two jobs." markdown="1">
**Most robots have two brains.** A Raspberry Pi or a Jetson runs Linux and ROS 2: it builds maps, plans paths and looks at camera images. It's powerful, but Linux makes no promise about _when_ your code runs: another program, the network or the disk can delay it by milliseconds.

The wheels can't wait. So a **microcontroller** handles everything that has to happen on time: it counts encoder edges, runs the PID loops, drives the H-bridge, reads the IMU and stops the motors if the computer goes quiet. The computer just sends it wheel speeds, and gets counts back.

The ESP32 is a common choice: two 240 MHz cores, 520 KB of RAM, Wi-Fi and Bluetooth, and, most usefully here, hardware made for motors and encoders. It costs a few dollars.

</div>

<div class="tf-step" data-step="poll" data-title="Polling: looking often enough." markdown="1">
**The simplest way to count edges is to look.** Read the encoder's two pins in a loop, compare with last time, and decode the change as part 4 did.

This works only if the pins are read at least once per state. Here they're read 10,000 times a second. Up to 10,000 edges a second, every edge is counted. Our Hall encoder makes at most 3,782, so it's fine.

Past that, it falls apart. At 12,000 edges a second, a third are missed. At 30,000, three steps happen between reads, which looks exactly like one step _backwards_: the wheel goes forward and the count says **−33%**. And if the reads come late (move the jitter slider), the trouble starts sooner: with ±30 µs of jitter, 7% are lost at 8,000 edges/s.

</div>

<div class="tf-step" data-step="interrupt" data-title="Interrupts: let the edge call you." markdown="1">
**Better: let each edge interrupt the processor.** The pin hardware notices every change and runs a short function, an **interrupt service routine** (ISR), that updates the count. Nothing is missed while there's time to run it.

But each interrupt costs CPU time, say 2 µs to save what the processor was doing, decode the pins and get back. Our Hall encoder at top speed takes 0.8% of a core. Swap it for a 500-line optical encoder on the motor shaft, 2,000 edges per motor turn, and at top speed it makes 172,000 edges a second: **34%** of a core, per wheel.

Two wheels, and two thirds of a core does nothing but count. Past 500,000 edges a second there's no time left at all.

</div>

<div class="tf-step" data-step="pcnt" data-title="The pulse counter: counting in hardware." markdown="1">
**The ESP32 has hardware that only counts**: the **pulse counter** (PCNT). Give it the A and B pins and it decodes quadrature by itself, at any speed the pins can carry, using no CPU time at all. It even has a glitch filter that ignores pulses too short to be real, from electrical noise in the motor wires.

The original ESP32 has eight of these units. The software only has to read the count, once per control cycle.

There's one catch. The counter is 16 bits, from −32,768 to 32,767. At 3,782 edges a second it wraps round every 17.3 s. So the software asks the PCNT to interrupt when it hits a limit, and adds up the wraps: a few interrupts a minute, instead of thousands a second.

</div>

<div class="tf-step" data-step="timing" data-title="A loop that keeps time." markdown="1">
**The PID loop is meant to run every 10 ms.** The obvious way to write it does the work, then waits 10 ms. But the work takes time too, here 1.3 ms on average, so each cycle lasts about 11.3 ms, and it varies.

That matters. Speed is counts divided by time. If the code divides by 10 ms when the cycle really took 12.3, the speed it computes is 23% off, and the PID reacts to a change that never happened.

The fix is to wait **until** the next multiple of 10 ms, with FreeRTOS's `vTaskDelayUntil`. Press the button: the cycles line up exactly. Now turn Wi-Fi on: when it holds the processor at the wrong moment, one cycle starts 4 ms late, and the speed for that cycle is 40% off. So the code should also measure the real time since the last cycle, with `esp_timer_get_time()`, and divide by that. And it should run the loop on the core the Wi-Fi isn't using.

</div>

<div class="tf-step" data-step="link" data-title="Talking to the computer." markdown="1">
**The ESP32 has to send its counts up and take wheel speeds down.** With **micro-ROS**, it joins the ROS 2 world directly: it publishes and subscribes to topics like any other node, through a small **agent** program on the Pi that relays its messages.

The link is often a USB serial line at 115,200 baud, which carries about 11,500 bytes a second. A full ROS `Odometry` message is about 720 bytes, mostly two 6 × 6 covariance matrices. At 50 Hz that's 36,000 bytes a second: **3.1 times** what the link can carry.

Send the two wheel counts instead, with a timestamp, about 16 bytes, and compute odometry on the Pi. Now 50 Hz takes 7% of the link. Or raise the baud rate: 921,600 is common.

</div>

  </div>
</section>

## The ESP32 at a glance

{: .tf-table}
| what | ESP32 | used for |
| -------------- | ---------------------------- | ------------------------------ |
| cores | 2 × Xtensa LX6, up to 240 MHz | one for control, one for Wi-Fi |
| memory | 520 KB SRAM | buffers, the micro-ROS client |
| PCNT | 8 counter units | encoders |
| PWM | MCPWM (2 units), LEDC | motor drivers, servos |
| buses | I²C, SPI, UART | IMU, lidar, the computer |

Newer chips in the family change the mix: the ESP32-S3 adds vector instructions and native USB, and some smaller ones, like the single-core ESP32-C3, drop the pulse counter entirely. Check before you buy, if your encoders need one.

The **MCPWM** unit is built for motors: it makes complementary PWM signals with dead time (a short gap so both transistors on one side of an H-bridge are never on at once), and can shut the outputs down in hardware when a fault pin goes active.

## A control task on the ESP32

In ESP-IDF, the whole of parts 4 and 5 fits in one FreeRTOS task, pinned to core 1:

```c
void control_task(void *arg) {
    TickType_t wake = xTaskGetTickCount();
    int64_t last = esp_timer_get_time();
    int last_l = 0, last_r = 0;
    for (;;) {
        vTaskDelayUntil(&wake, pdMS_TO_TICKS(10));   // every 10 ms, on the dot
        int64_t now = esp_timer_get_time();
        float dt = (now - last) * 1e-6f;             // the real time, not the hoped-for one
        last = now;
        int l = encoder_total(LEFT), r = encoder_total(RIGHT);  // PCNT count + wraps
        float wl = (l - last_l) * TWO_PI / 1320 / dt;
        float wr = (r - last_r) * TWO_PI / 1320 / dt;
        last_l = l; last_r = r;
        set_duty(LEFT,  pid(&pid_l, target_l, wl, dt));
        set_duty(RIGHT, pid(&pid_r, target_r, wr, dt));
        if (now - last_command > 200000) stop_motors();  // no command for 200 ms: stop
    }
}
// xTaskCreatePinnedToCore(control_task, "control", 4096, NULL, 10, NULL, 1);
```

The last line in the loop is a **watchdog**: if the computer crashes or a cable comes loose, the robot stops instead of driving on at its last speed.

## What's still missing

- **The computer side.** Which board, how fast it needs to be, and how its delays turn into stopping distance: part 7.
- **The ROS 2 side** of micro-ROS, topics and QoS: part 10.

## Going deeper

### Why polling fails the way it does

Quadrature has four states per cycle. If the encoder moves $$n$$ states between two reads, the decoder only sees $$n \bmod 4$$: 0 looks like standing still, 1 like a step forward, 2 is ambiguous and 3 looks like a step back. So with $$f$$ edges a second and reads every $$T$$ seconds, $$fT$$ must stay below 1, or at worst well below 2. It's the same **aliasing** that makes car wheels seem to spin backwards in films.

### Interrupt latency

An ISR doesn't run the instant an edge arrives: the processor finishes its current instruction, saves its registers, and may first finish a higher-priority interrupt. If the next edge on the same pin arrives before the ISR has read the pins, the decoder sees a two-state jump. Keep ISRs short, put them in IRAM on the ESP32 so they don't wait for flash, and keep anything slow out of them.

### Real time, and what Linux can do

"Real time" doesn't mean fast. It means **bounded**: a promise that a task runs within some worst-case delay. A microcontroller with FreeRTOS gives tens of microseconds. Stock Linux can occasionally take many milliseconds; the `PREEMPT_RT` patches, now part of the mainline kernel, bring that down to well under a millisecond on good hardware, which is how `ros2_control` can run motor loops on the main computer on bigger robots.

## Further reading

- Espressif, [ESP32 technical reference manual](https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf): the PCNT, MCPWM and LEDC chapters.
- Espressif, [ESP-IDF pulse counter (PCNT) driver](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/pcnt.html): quadrature decoding, glitch filters and watch points.
- [micro-ROS](https://micro.ros.org/): ROS 2 on microcontrollers, with ports for the ESP32.
- FreeRTOS, [`vTaskDelayUntil`](https://www.freertos.org/vtaskdelayuntil.html): fixed-frequency tasks.

{% include mr-series.liquid %}
