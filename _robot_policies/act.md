---
layout: robot-policy
title: ACT on the NexArm
model_name: ACT
full_name: Action Chunking with Transformers
description: A CVAE-trained transformer that turns the NexArm's camera frames and joint state into 100 future joint targets, then runs all of them before it looks again.
order: 1
policy:
  horizon: 100
  execute: 100
  fps: 30
facts:
  - label: actions per chunk
    value: "100"
  - label: actions run before re-planning
    value: "100"
  - label: control rate
    value: 30 Hz
  - label: encoder tokens (3 cameras)
    value: "902"
  - label: backbone
    value: ResNet18
  - label: training steps
    value: 100k
steps:
  - id: overview
    title: One control cycle
    body: >-
      ACT is conditioned on images and joint state only; it does not read the task text. Each cycle it reads every
      camera once, encodes them together with the arm's state, and predicts a **chunk of 100 actions**: joint and gripper
      targets for the next 3.33 seconds at 30 Hz. The NexArm then runs the whole chunk before the policy is called again.
    shapes: "images 3 × 3×480×640 · state 6 → chunk 100 × 6"
    stage:
      shot: hero
      cams: true
      chunk: true
  - id: observe
    title: Observe
    body: >-
      The front Logitech, the wrist camera and, on the 3-camera dataset, the top RealSense each deliver one RGB frame.
      The five arm joints plus the gripper give a six-number state. Images and state are normalized with the dataset's
      mean and standard deviation (the backbone sees ImageNet statistics).
    shapes: "observation.images.{front,wrist,top} 3×480×640 · observation.state 6"
    bounds: [30, 96, 310, 500]
    stage:
      shot: front
      cams: true
      frustums: true
  - id: backbone
    title: ResNet18 per image
    body: >-
      One ImageNet-initialized ResNet18 is shared by all cameras. Its last stage leaves a 512 × 15 × 20 feature map
      (stride 32). A 1×1 convolution keeps 512 channels, a 2D sinusoidal embedding marks where each cell came from, and
      the map is flattened into 300 tokens per camera.
    shapes: "3×480×640 → 512×15×20 → 300 × 512 per camera"
    bounds: [390, 96, 340, 510]
    stage:
      shot: top
      cams: true
      frustums: true
  - id: encoder
    title: Transformer encoder
    body: >-
      The encoder sees one sequence: a style token *z* (all zeros at inference), the joint state projected to 512, and
      the 900 image tokens. Four post-norm layers with 8 heads and a 3200-wide feed-forward let every token attend to
      every other, so a gripper pixel in the wrist view can be related to a bowl in the front view and to the current
      joint angles.
    shapes: "902 × 512 → 4 × self-attention → memory 902 × 512"
    bounds: [780, 96, 320, 480]
    stage:
      shot: side
      joints: true
  - id: decoder
    title: Decoder and action head
    body: >-
      One hundred learned queries, one for each future time step, go through a single decoder layer: self-attention
      among the queries and cross-attention into the encoder memory. A linear layer maps each query to six numbers,
      which are un-normalized into five joint targets and a gripper target.
    shapes: "100 queries × 512 → Linear 512→6 → chunk 100 × 6"
    bounds: [1150, 96, 420, 540]
    stage:
      shot: chunk
      chunk: true
  - id: execute
    title: Execute the whole chunk
    body: >-
      lerobot-nexarm keeps ACT's default `n_action_steps = 100` with no temporal ensembling: the arm follows all 100
      targets open loop, one every 33 ms, then captures new frames. In the 3D view the dots ahead of the gripper are the
      part of the current chunk still to run; when they run out, the next cycle starts.
    shapes: "100 actions × 33 ms = 3.33 s between observations"
    bounds: [30, 680, 1550, 200]
    stage:
      shot: hero
      chunk: true
      joints: true
results:
  measured: false
  summary: >-
    No physical success rate has been published yet. Training reports only the L1 loss on held-out episodes, which
    does not say whether the arm actually stacks the bowls. The table and protocol below are the planned evaluation, not results.
  metrics:
    - name: Stacking success rate
      method: Fraction of trials that end with the bowls nested and released, judged from the front camera.
    - name: Sub-task success
      method: Separate counts for grasp, lift, place and release, so a failure can be located.
    - name: Time to stack
      method: Seconds from the first action to the gripper opening over the stack, successful trials only.
    - name: Held-out L1
      method: Mean L1 over normalized actions on the last 10% of episodes, logged every 5,000 steps.
  protocol:
    - Fixed bowl start poses drawn from the recorded workspace, the same list for every policy.
    - "Each trial starts from the robot's ready pose with `examples/nexarm/rollout.py` and the checkpoint's own camera set."
    - A trial ends at success, at a collision, or after 60 seconds.
links:
  - label: lerobot-nexarm
    url: https://github.com/khanhthanhdev/lerobot-nexarm
    note: robot, simulation and training code
  - label: ACT training guide
    url: https://github.com/khanhthanhdev/lerobot-nexarm/blob/main/examples/nexarm/stack_bowls_act.md
  - label: thanhkt/nexarm_stack_bowls
    url: https://huggingface.co/datasets/thanhkt/nexarm_stack_bowls
    note: real demonstrations on the Hugging Face Hub
  - label: Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware
    url: https://arxiv.org/abs/2304.13705
    note: the ACT paper (Zhao et al., 2023)
---

## Architecture

ACT predicts actions in chunks instead of one at a time. Predicting 100 steps at once means a single mistake in one prediction is not compounded at every step, and it lets the policy represent a smooth motion rather than a series of corrections. The cost is that the arm moves without new observations for the length of the executed part of the chunk; on the NexArm that is the full 3.33 seconds.

| Part             | Setting in lerobot-nexarm                                         |
| ---------------- | ----------------------------------------------------------------- |
| Vision backbone  | ResNet18, ImageNet-1k weights, shared across cameras              |
| Image tokens     | 1×1 conv to 512, 2D sine position embedding, 300 per 480×640 view |
| Encoder          | 4 layers, d_model 512, 8 heads, FFN 3200, ReLU, post-norm         |
| Decoder          | 1 layer, 100 learned queries                                      |
| Action head      | Linear 512 → 6                                                    |
| Latent           | 32-dimensional CVAE latent, KL weight 10                          |
| Normalization    | mean / std for state and actions, ImageNet stats for images       |
| Chunk / executed | 100 / 100 actions, no temporal ensembling                         |

## Training

The model is trained as a conditional VAE. A second, smaller transformer reads the current joint state and the true next 100 actions and compresses them into a 32-dimensional latent _z_. That latent becomes the first token of the main encoder, so the network can tell apart demonstrations that look the same but were performed differently. The KL term keeps _z_ close to a unit Gaussian, which is why it can be replaced by zeros at inference.

<figure class="rp-figure-scroll">
{% include robot-policy/act-training.svg %}
<figcaption>The CVAE branch exists only in training. At inference ACT feeds z = 0 and the rest of the network is unchanged.</figcaption>
</figure>

| Setting         | Value                                                                  |
| --------------- | ---------------------------------------------------------------------- |
| Data            | Real teleoperated demonstrations, `thanhkt/nexarm_stack_bowls`         |
| Held-out split  | last 10% of episodes per task                                          |
| Effective batch | 16 (batch 2 × 8 gradient-accumulation steps, sized for an 8 GB GPU)    |
| Optimizer       | AdamW, lr 1e-5 for the transformer and the backbone, weight decay 1e-4 |
| Steps           | 100,000, checkpoint and held-out loss every 5,000                      |
| Loss            | L1 on actions, masked past the episode end, + 10 · KL                  |

<div class="rp-callout" markdown="1">
**Camera sets must match.** The default dataset has front and wrist cameras only; a 3-camera recording adds the top view. A policy trained on two cameras needs `--no-top-cam` at rollout, and `rollout.py` stops if the checkpoint and the robot disagree.
</div>
