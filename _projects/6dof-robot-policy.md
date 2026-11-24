---
layout: post
title: "Building a Robot Learning Pipeline for the 6-DOF NexArm"
date: 2026-10-11
description: "How our team connected a stable robot workspace, human demonstrations, a calibrated simulation, and policy training."
tags: [robotics, imitation-learning, vla, turbovla, sim2real, mujoco, isaac-lab, lerobot, teleoperation]
category: work
importance: 1
img: /assets/img/projects/6dof-robot/setup_1.jpg
github: https://github.com/khanhthanhdev/lerobot-nexarm
css:
  - /assets/css/screen-works.css
  - /assets/css/nexarm-project.css
toc:
  sidebar: true
---

<div class="nx">

<div class="nx-hero">
  <img src="{{ '/assets/img/projects/6dof-robot/setup_1.jpg' | relative_url | bust_file_cache }}" alt="NexArm workspace with the aluminium gantry, leader and follower arms, and camera mounts">
  <div class="nx-hero-copy">
    <div class="nx-eyebrow">VinUniversity · Robot learning · 2026</div>
    <p>A real-to-sim-to-real pipeline for the Hiwonder NexArm: a fixed three-camera rig, leader–follower demonstrations, a MuJoCo twin fitted to the real servos, and imitation-learning policies trained on both.</p>
    <div class="nx-chips"><span>LeRobot</span><span>MuJoCo</span><span>Isaac Lab</span><span>cuRobo</span><span>PyTorch</span><span>ACT</span><span>TurboVLA</span></div>
  </div>
</div>

<div class="nx-stats">
  <div class="nx-stat"><b>6-DoF</b><span>5 joints + parallel gripper</span></div>
  <div class="nx-stat"><b>±2 mm</b><span>repeatability</span></div>
  <div class="nx-stat"><b>3 cameras</b><span>640×480 RGB at 30 fps</span></div>
  <div class="nx-stat"><b>20 Hz</b><span>recording and control</span></div>
  <div class="nx-stat"><b>464</b><span>episodes: 164 real + 300 sim</span></div>
  <div class="nx-stat"><b>16 / 20</b><span>bowl stacks in simulation</span></div>
</div>

</div>

Robot learning depends on more than a model. A camera that shifts between sessions changes the images a policy sees; an arm that responds differently from its simulation changes the actions it needs. Our team built the parts around the model so that real demonstrations, simulated demonstrations and the policies trained on them describe the same robot.

<div class="nx">
<ol class="nx-pipeline">
  <li><b>Fixed rig</b><span>Gantry holds the arms and three cameras in repeatable poses.</span></li>
  <li><b>Teleoperation</b><span>Leader–follower demos recorded as LeRobot datasets.</span></li>
  <li><b>Digital twin</b><span>MuJoCo arm fitted to real joint traces and camera views.</span></li>
  <li><b>Synthetic data</b><span>Domain-randomized bowl stacking with cuRobo planning.</span></li>
  <li><b>Training</b><span>ACT, TurboVLA, B-spline, DEM and RTPolicy.</span></li>
  <li><b>Evaluation</b><span>Seeded sim benchmark, then a fixed hardware protocol.</span></li>
</ol>
</div>

## The hardware

The NexArm is an all-metal six-axis arm driven by bus servos with 4096-count magnetic encoders. An ESP32 and an AT32 split communication and motor control, which is what lets a passive leader arm drive a powered follower with millisecond-level tracking. The repository's LeRobot robot and teleoperator plugins speak its UART protocol directly: synchronous read and write of all six servos, torque control, and the bridge mode that streams state at the full control rate instead of the 5 Hz telemetry feed.

<div class="nx">
<div class="nx-specs">
  <div class="nx-spec">
    <h3 data-toc-skip>Arm</h3>
    <dl>
      <dt>Joints</dt><dd>5 + gripper</dd>
      <dt>Servo torque</dt><dd>65 kg·cm</dd>
      <dt>Payload</dt><dd>500 g</dd>
      <dt>Reach</dt><dd>0.5 m</dd>
      <dt>Controller</dt><dd>ESP32 + AT32</dd>
    </dl>
  </div>
  <div class="nx-spec">
    <h3 data-toc-skip>Sensing</h3>
    <dl>
      <dt>Front</dt><dd>Logitech, MJPG</dd>
      <dt>Wrist</dt><dd>icSpring, YUYV</dd>
      <dt>Top</dt><dd>RealSense D435i</dd>
      <dt>Capture</dt><dd>640×480 @ 30 fps</dd>
      <dt>Recording</dt><dd>20 fps</dd>
    </dl>
  </div>
  <div class="nx-spec">
    <h3 data-toc-skip>Software</h3>
    <dl>
      <dt>Framework</dt><dd>LeRobot plugins</dd>
      <dt>Simulation</dt><dd>MuJoCo, Isaac Lab</dd>
      <dt>Planning</dt><dd>cuRobo</dd>
      <dt>Logging</dt><dd>Rerun .rrd</dd>
      <dt>Env</dt><dd>Gymnasium</dd>
    </dl>
  </div>
</div>
</div>

Every joint uses the same encoder convention on hardware and in simulation, so a recorded action can be replayed in either without conversion code in between:

```python
rad = (raw - 2048) * 2 * math.pi / 4096   # arm joints; gripper raw 1195 = open, 2833 = closed
```

## A workspace that stays consistent

I designed an aluminium-extrusion gantry in Fusion 360 to hold the arm bases and cameras in fixed positions. The overhead RealSense sees the whole table, the front camera shows the gripper's approach, and the wrist camera covers the moments when the arm blocks the other two. Fixed viewpoints make demonstrations comparable across sessions, and they give the simulator a camera pose it can match.

<div class="nx">
<div class="nx-bento">
  <figure>
    <img src="{{ '/assets/img/projects/6dof-robot/setup_1.jpg' | relative_url | bust_file_cache }}" alt="Leader and follower NexArms on the gantry workspace" loading="lazy">
    <figcaption>Leader, follower and camera gantry</figcaption>
  </figure>
  <figure>
    <img src="{{ '/assets/img/projects/6dof-robot/cad-workspace-fusion360.jpg' | relative_url | bust_file_cache }}" alt="Gantry design in Fusion 360" loading="lazy">
    <figcaption>Fusion 360 gantry</figcaption>
  </figure>
  <figure>
    <img src="{{ '/assets/img/projects/6dof-robot/wrist-camera-mount.jpg' | relative_url | bust_file_cache }}" alt="Wrist camera mount above the gripper" loading="lazy">
    <figcaption>Wrist camera mount</figcaption>
  </figure>
</div>
<p class="nx-caption">The gantry fixes the arm bases and all three camera poses, so the scene stays the same between sessions.</p>
</div>

## Collecting demonstrations

An operator moves the unpowered leader arm while the powered follower copies it. Each session records the follower's joint state and actions with three synchronized RGB views, then merges into one local dataset. The merge checks fps, robot type, camera set and image shapes before recording starts, keeps an import ledger so a retried session adds no duplicates, and builds the new dataset beside the old one before swapping it in.

<div class="nx">
<div class="nx-split">
  <div>
    <video
      src="{{ '/assets/video/teleop-demonstration.mp4' | relative_url | bust_file_cache }}"
      poster="{{ '/assets/img/projects/6dof-robot/teleop-poster.webp' | relative_url | bust_file_cache }}"
      controls
      playsinline
      preload="none"
      width="720"
      height="1280"
      aria-label="Leader–follower teleoperation during data collection"
    >
      <a href="{{ '/assets/video/teleop-demonstration.mp4' | relative_url | bust_file_cache }}">Watch the teleoperation demonstration.</a>
    </video>
    <div class="nx-cap">Leader–follower teleoperation during data collection.</div>
  </div>
  <div>
    <div class="nx-eyebrow">What the data taught us</div>
    <ul class="nx-steps">
      <li><b>Idle starts confuse the policy.</b> Each real episode opened with about 1.5 s of no motion, 12% of all frames. The same image then meant both "wait" and "move", and rollouts hesitated. We now trim each episode to start 3 frames before the leader moves more than 10 encoder ticks.</li>
      <li><b>Control rate must match.</b> The cameras capture at 30 fps but recording, simulation and rollout all run at 20 Hz. A policy trained at one rate and run at another moves at the wrong speed.</li>
      <li><b>Bridge mode matters.</b> Without it the recorder reads the 5 Hz telemetry stream and silently records a quarter of the motion.</li>
    </ul>
  </div>
</div>
</div>

## Fitting the simulation to the real arm

We built a MuJoCo scene for a three-bowl stacking task and fitted it to the hardware, in order, because each step depends on the one before it. A wrong joint mapping makes every dynamics fit wrong, and wrong dynamics make camera checks on a moving arm misleading.

<div class="nx">
<ol class="nx-steps">
  <li><b>Joint mapping.</b> Measure how each servo's raw reading maps to its simulated joint. Replaying one recorded episode without the correct mapping put the simulated gripper 39 mm inside the panel behind the arm.</li>
  <li><b>Latency and servo dynamics.</b> From 20 free-motion episodes, fit the action delay (0–6 control steps) and each joint's time constant, <code>(kv + damping) / kp</code>, within 0.25×–4× of the servo model. The spread of the fit becomes the domain-randomization range.</li>
  <li><b>Cameras.</b> Align each simulated camera's pose and field of view by overlaying real and rendered frames, and fit a colour transform for the RealSense's blue, washed-out image.</li>
  <li><b>Scene.</b> Match the bowl slots and table to the real workspace, then check the result with replays and overlays before generating any data.</li>
</ol>
</div>

The generator then produces scripted demonstrations with cuRobo motion planning and physical grasping, randomizing lighting, materials, camera pose, servo dynamics, and object friction and mass. Failed or low-quality attempts are rejected and logged with a reason; a clean checkout accepts 90–100% of attempts. The published set, `thanhkt/nexarm_stack_bowls_sim_mapped`, has **300 episodes and 132,902 frames** at 20 fps.

## Policies

The project trains several policy families through the same LeRobot plugins, so each can be benchmarked in simulation and run on the arm with the same commands. The [robot policy explorer]({{ '/works/robot-policy/' | relative_url }}) walks through one control cycle of each, next to a 3D model of the NexArm in the bowl-stacking scene.

<div class="nx">
<div class="nx-policies">
  <a class="nx-policy" href="{{ '/works/robot-policy/act/' | relative_url }}">
    <div class="nx-eyebrow">Images + state</div>
    <h3 data-toc-skip>ACT</h3>
    <p>CVAE-trained transformer that predicts a long chunk of joint targets.</p>
    <ul>
      <li>Backbone <b>ResNet18</b></li>
      <li>Encoder tokens <b>902</b></li>
      <li>Chunk / executed <b>100 / 100</b></li>
    </ul>
    <span class="nx-more">Explore ACT →</span>
  </a>
  <a class="nx-policy" href="{{ '/works/robot-policy/turbovla/' | relative_url }}">
    <div class="nx-eyebrow">Images + state + text</div>
    <h3 data-toc-skip>TurboVLA</h3>
    <p>Compact VLA: DINOv3 vision and BERT text fused by bi-attention.</p>
    <ul>
      <li>Backbone <b>DINOv3 ViT-B/16</b></li>
      <li>Vision tokens <b>588</b></li>
      <li>Chunk / executed <b>16 / 8</b></li>
    </ul>
    <span class="nx-more">Explore TurboVLA →</span>
  </a>
  <a class="nx-policy" href="{{ '/works/robot-policy/bsp/' | relative_url }}">
    <div class="nx-eyebrow">Diffusion</div>
    <h3 data-toc-skip>B-spline Policy</h3>
    <p>Diffusion Policy that denoises a cubic B-spline instead of a list of actions.</p>
    <ul>
      <li>Knots per segment <b>16</b></li>
      <li>Policy rate <b>10 Hz</b></li>
      <li>Controller rate <b>100 Hz</b></li>
    </ul>
    <span class="nx-more">Explore BSP →</span>
  </a>
  <a class="nx-policy" href="{{ '/works/robot-policy/dem/' | relative_url }}">
    <div class="nx-eyebrow">One-step generative</div>
    <h3 data-toc-skip>DEM</h3>
    <p>DINOv3 ConvNeXt and frozen NeoBERT feed a MeanFlow head that turns noise into actions in one pass.</p>
    <ul>
      <li>Context tokens <b>801</b></li>
      <li>Sampling steps <b>1</b></li>
      <li>Chunk / executed <b>16 / 8</b></li>
    </ul>
    <span class="nx-more">Explore DEM →</span>
  </a>
  <div class="nx-policy">
    <div class="nx-eyebrow">Real + sim</div>
    <h3 data-toc-skip>RTPolicy</h3>
    <p>A real-time policy trained on mixed real and synthetic data.</p>
    <ul>
      <li>Real episodes <b>164</b></li>
      <li>Sim episodes <b>300</b></li>
      <li>Sim success <b>16 / 20</b></li>
    </ul>
  </div>
</div>
</div>

## Policy rollout on the arm

<div class="nx">
<div class="nx-split">
  <div>
    <video
      src="{{ '/assets/video/20261118_172224.mp4' | relative_url | bust_file_cache }}"
      poster="{{ '/assets/img/projects/6dof-robot/policy-rollout-poster.webp' | relative_url | bust_file_cache }}"
      controls
      playsinline
      preload="none"
      width="720"
      height="1280"
      aria-label="NexArm policy rollout demonstration"
    >
      <a href="{{ '/assets/video/20261118_172224.mp4' | relative_url | bust_file_cache }}">Watch the policy rollout demonstration.</a>
    </video>
    <div class="nx-cap">A trained policy running on the NexArm.</div>
  </div>
  <div>
    <div class="nx-eyebrow">Hardware evaluation protocol</div>
    <p>A checkpoint first has to pass the seeded simulation benchmark; a model that fails there will not work on the arm. On hardware, every model runs the same fixed protocol:</p>
    <ul class="nx-steps">
      <li>Place the three bowls on the slots the simulation uses, measured from the base's pan axis.</li>
      <li>Run each trial for up to 90 s and record success, meaning all three bowls stacked in order, or the failure: missed grasp, dropped bowl, wrong order, timeout or collision.</li>
      <li>Report successes out of 10 per model. With 10 trials, a gap under about 30 points between two models is within the noise.</li>
    </ul>
  </div>
</div>
</div>

## What we learned

<div class="nx">
<div class="nx-callout">
  <p>Stable cameras, clean demonstrations and a calibrated simulation are part of the learning system, not setup work before it. Each problem above, from idle frames to a 39 mm mapping error, would have looked like a model failure.</p>
</div>
</div>

The next result we need is a controlled hardware comparison of policies trained on real data alone against policies trained on real and simulated data, run under the protocol above.

{% include figure.liquid path="/assets/img/projects/6dof-robot/robotics-lab-team.jpg" title="Robotics research team at VinUniversity" class="img-fluid rounded z-depth-1 my-3" %}

Thanks to our VinUniversity teammates, professors, and lab collaborators for their work on the hardware, workspace, and data collection. The code, calibration tools and experiment logs are in the [NexArm repository](https://github.com/khanhthanhdev/lerobot-nexarm).
