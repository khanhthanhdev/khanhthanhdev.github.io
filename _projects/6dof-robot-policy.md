---
layout: post
title: "Building a Robot Learning Pipeline for the 6-DOF NexArm"
date: 2026-10-11
description: "How our team connected a stable robot workspace, human demonstrations, simulation, and policy training."
tags: [robotics, imitation-learning, vla, turbovla, sim2real, mujoco, isaac-lab, lerobot, teleoperation]
category: work
importance: 1
img: /assets/img/projects/6dof-robot/thumbnail.jpg
github: https://github.com/khanhthanhdev/lerobot-nexarm
toc:
  sidebar: true
mermaid:
  enabled: true
  zoomable: true
---

Robot learning depends on more than a model. A camera that shifts between sessions changes the images a policy sees; an arm that responds differently from its simulation changes the actions it needs. At VinUniversity, our team built a workflow around the **Hiwonder NexArm** to make those parts work together.

```mermaid
flowchart LR
    Rig["Fixed workspace<br/>NexArm + three cameras"] --> Demo["Leader–follower<br/>demonstrations"]
    Rig --> Sim["MuJoCo<br/>simulation"]
    Demo --> Cal["Trajectory replay<br/>and camera alignment"] --> Sim
    Sim --> Synthetic["Scripted bowl-stacking<br/>demonstrations"]
    Demo --> Train["Policy training<br/>ACT / TurboVLA"]
    Synthetic --> Train
    Train --> Eval["Simulation and<br/>hardware evaluation"]
```

## A workspace that stays consistent

I designed an aluminum-extrusion gantry to hold the arm bases and cameras in fixed positions. The overhead camera captures the full table, the front camera shows the gripper's approach, and a wrist camera helps when the arm blocks the other views. Keeping those viewpoints stable makes demonstrations easier to compare across sessions and with simulation.

{% include figure.liquid path="/assets/img/projects/6dof-robot/workspace-setup.jpg" title="NexArm workspace with the gantry, leader and follower arms, and camera mounts" class="img-fluid rounded z-depth-1 my-3" %}

<div class="row my-3">
  <div class="col-sm-6 mt-3 mt-md-0">
    {% include figure.liquid path="/assets/img/projects/6dof-robot/cad-workspace-fusion360.jpg" title="Gantry design in Fusion 360" class="img-fluid rounded z-depth-1" %}
  </div>
  <div class="col-sm-6 mt-3 mt-md-0">
    {% include figure.liquid path="/assets/img/projects/6dof-robot/wrist-camera-mount.jpg" title="Wrist camera mount above the gripper" class="img-fluid rounded z-depth-1" %}
  </div>
</div>

## From human demonstrations to simulation

An operator moves the unpowered leader arm while the powered follower copies the motion. The recording workflow captures the follower's actions and three synchronized RGB views, then combines completed sessions into a local dataset. The RealSense depth stream helps check the camera setup, but it is not part of the policy dataset.

<div class="my-4">
  <video src="/assets/video/teleop-demonstration.mp4" controls width="100%" class="rounded z-depth-1 shadow-sm"></video>
  <p class="text-muted mt-2 small">Leader–follower teleoperation during data collection.</p>
</div>

We also built a MuJoCo scene for a three-bowl stacking task. Recorded joint trajectories help tune the simulated arm's response, while a camera overlay helps align the simulated and physical views. The simulator can then produce scripted demonstrations with varied visual and physical conditions. Its assisted grasping makes those episodes useful for training experiments, but it does not measure real-world grasp success.

## Policy training and evaluation

The project includes an ACT path for learning from camera views and robot state, plus a TurboVLA path that also accepts a task instruction. Real and simulated demonstrations can be used together during training. The diagram shows the intended flow through evaluation; this page does not claim a measured physical success rate for a trained policy.

The work taught us that stable cameras, repeatable demonstrations, and a calibrated simulation are all part of the learning system. The next meaningful result is a controlled hardware evaluation that compares policies trained with real data alone and with a mixture of real and simulated data.

{% include figure.liquid path="/assets/img/projects/6dof-robot/robotics-lab-team.jpg" title="Robotics research team at VinUniversity" class="img-fluid rounded z-depth-1 my-3" %}

Thanks to our VinUniversity teammates, professors, and lab collaborators for their work on the hardware, workspace, and data collection. The implementation is available in the [NexArm repository](https://github.com/khanhthanhdev/lerobot-nexarm).
