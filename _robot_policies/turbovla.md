---
layout: robot-policy
title: TurboVLA on the NexArm
model_name: TurboVLA
full_name: TurboVLA, a compact vision-language-action model
description: DINOv3 image tokens and a BERT-encoded instruction are fused by six bi-attention layers, and an ACT-style decoder predicts 16 actions, of which the NexArm runs 8 before looking again.
order: 2
policy:
  horizon: 16
  execute: 8
  fps: 30
facts:
  - label: actions per chunk
    value: "16"
  - label: actions run before re-planning
    value: "8"
  - label: control rate
    value: 30 Hz
  - label: vision tokens (3 cameras)
    value: "588"
  - label: backbone
    value: DINOv3 ViT-B/16
  - label: training steps
    value: 50k
steps:
  - id: overview
    title: One control cycle
    body: >-
      TurboVLA reads the cameras, the joint state **and the task instruction**. A self-supervised vision transformer and a
      language model encode them, six interaction layers let each modality look at the other, and a small decoder
      predicts 16 future actions. Only the first 8 are run, about a quarter of a second, before the policy sees the scene
      again.
    shapes: "images V × 3×224×224 · text L tokens · state 6 → chunk 16 × 6"
    stage:
      shot: hero
      cams: true
      chunk: true
  - id: observe
    title: Observe
    body: >-
      Every camera frame is resized to 224 × 224. Views are ordered front, wrist, top; the top camera is used only when
      the dataset recorded it, and the order is saved in the checkpoint's config. The six-number joint state is min-max
      scaled to [-1, 1] with statistics saved at training time.
    shapes: "V = 2 or 3 views · state 6 in [-1, 1]"
    bounds: [30, 96, 310, 510]
    stage:
      shot: front
      cams: true
      frustums: true
  - id: vision
    title: DINOv3 vision encoder
    body: >-
      Each view goes through DINOv3 ViT-B/16 separately. A 224-pixel image is 14 × 14 patches of 16 pixels, so every view
      becomes 196 tokens of width 768. A residual MLP projects them to 256 and a learned view embedding records which
      camera they came from. Unlike ACT's ResNet, the backbone was pre-trained without labels on 1.7 billion images.
    shapes: "V × 196 × 768 → V × 196 × 256 → 588 × 256"
    bounds: [390, 96, 340, 290]
    stage:
      shot: top
      cams: true
      frustums: true
  - id: language
    title: BERT language encoder
    body: >-
      The instruction, for example the dataset's "stack the bowls" prompt, is tokenized with WordPiece and encoded by
      BERT-base. BERT stays frozen by default, and a linear layer maps its 768-wide outputs to the model width of 256.
      Padding positions are masked out of every later attention.
    shapes: "L × 768 → Linear → L × 256"
    bounds: [390, 396, 340, 210]
    stage:
      shot: hero
      cams: false
      chunk: false
  - id: interaction
    title: Vision ↔ language interaction
    body: >-
      Six layers fuse the two streams. In each, a bi-attention block lets image tokens attend to text tokens and text
      tokens attend to image tokens at the same time (4 heads, inner width 1024, drop-path 0.1); a transformer layer
      then refines the text tokens on their own. The result is one sequence of image and text tokens that already agree on
      what matters for this instruction.
    shapes: "(588 + L) × 256 → 6 × bi-attention → (588 + L) × 256"
    bounds: [780, 96, 320, 480]
    stage:
      shot: side
      cams: true
  - id: action
    title: ACT-style action head
    body: >-
      The joint state becomes two extra tokens through a small MLP. Sixteen learned queries cross-attend to the fused
      tokens and the state tokens through three pre-norm decoder layers (8 heads, feed-forward 2048). An MLP maps each
      query to six numbers and `tanh` keeps them in [-1, 1], which the min-max statistics turn back into joint and gripper
      targets. There is no CVAE: the output is one deterministic chunk.
    shapes: "16 queries × 256 → 3 decoder layers → MLP → tanh → 16 × 6"
    bounds: [1150, 96, 420, 530]
    stage:
      shot: chunk
      chunk: true
      joints: true
  - id: execute
    title: Run 8, then infer again
    body: >-
      `rollout_turbovla.py` runs the first 8 actions of the chunk (`--open-loop-steps 8`) at 30 Hz, about 0.27 s, and
      throws the other 8 away. Then it captures new frames and runs the whole network again. In the 3D view, the dots
      ahead of the gripper are the actions still to run before the next inference.
    shapes: "8 × 33 ms = 0.27 s between observations"
    bounds: [30, 680, 1550, 200]
    stage:
      shot: hero
      chunk: true
      joints: true
results:
  measured: false
  summary: >-
    No physical success rate has been published yet. The training script logs the masked L1 loss, which does not say
    whether the arm actually stacks the bowls. The table and protocol below are the planned evaluation, not results.
  metrics:
    - name: Stacking success rate
      method: Fraction of trials that end with the bowls nested and released, judged from the front camera.
    - name: Sub-task success
      method: Separate counts for grasp, lift, place and release, so a failure can be located.
    - name: Sim-to-real gap
      method: Success in the MuJoCo scene minus success on the real arm for the same checkpoint and start poses.
    - name: Effect of co-training
      method: "Real-arm success with `--real-ratio 0.5` against a real-data-only run of the same length."
  protocol:
    - Fixed bowl start poses drawn from the recorded workspace, the same list for every policy.
    - "Each trial starts from the robot's ready pose with `examples/nexarm/rollout_turbovla.py` and the EMA checkpoint."
    - A trial ends at success, at a collision, or after 60 seconds.
links:
  - label: lerobot-nexarm
    url: https://github.com/khanhthanhdev/lerobot-nexarm
    note: robot, simulation, training and rollout scripts
  - label: TurboVLA guide for the NexArm
    url: https://github.com/khanhthanhdev/lerobot-nexarm/blob/main/docs/source/nexarm/turbovla_guide.md
  - label: thanhkt/nexarm_stack_bowls
    url: https://huggingface.co/datasets/thanhkt/nexarm_stack_bowls
    note: real demonstrations on the Hugging Face Hub
---

## Architecture

TurboVLA keeps ACT's idea of decoding a chunk of actions from learned queries, but replaces the encoder side. Images are encoded by a large self-supervised vision transformer, the task arrives as text, and the two are fused before the action head reads them. The chunk is short (16 actions) and only half of it is run, so the policy re-plans about every quarter second.

| Part              | Setting used for the NexArm                                     |
| ----------------- | --------------------------------------------------------------- |
| Vision            | DINOv3 ViT-B/16, 224 × 224, views encoded separately, trainable |
| Vision projection | LayerNorm → MLP to 256 with a linear skip, + view embedding     |
| Language          | BERT-base uncased, frozen, Linear 768 → 256                     |
| Interaction       | 6 × (bi-attention 4 heads, inner 1024 + text transformer layer) |
| State             | LayerNorm → MLP 6 → 256 → 2 tokens                              |
| Action decoder    | 16 queries, 3 pre-norm layers, d 256, 8 heads, FFN 2048         |
| Output            | MLP 256 → 512 → 6, tanh, min-max to joint units                 |
| Chunk / executed  | 16 / 8 actions                                                  |

## Training

The training script can mix two sources: scripted bowl-stacking demonstrations generated in the MuJoCo scene with domain randomization, and real teleoperated demonstrations. With `--real-ratio 0.5` a sampler draws each training sample from the real set with probability one half, so the smaller real set is not drowned out by simulation.

<figure class="rp-figure-scroll">
{% include robot-policy/turbovla-training.svg %}
<figcaption>Co-training on simulation and real data. The saved checkpoint is the moving average of the weights, together with the statistics and config that the rollout script needs.</figcaption>
</figure>

| Setting        | Default in `train_turbovla.py`                                   |
| -------------- | ---------------------------------------------------------------- |
| Data           | sim + real, or either alone (`--no-sim` for real only)           |
| Batch          | 16 per device, no accumulation                                   |
| Optimizer      | AdamW, lr 5e-5 for the head, interaction and DINOv3              |
| Schedule       | 1,000 linear warm-up steps, 50,000 steps, checkpoint every 5,000 |
| Loss           | L1 over non-padded chunk steps, optional `--gripper-loss-weight` |
| Stability      | gradient clipping at 1.0, EMA of weights with decay 0.999        |
| Starting point | from scratch, or the released RoboTwin checkpoint                |

<div class="rp-callout" markdown="1">
**The checkpoint carries its own contract.** `config.json` stores the camera keys in order, the image size, the fps and the default task prompt, and `stats_turbovla.json` stores the min-max ranges. The rollout script reads both, so a checkpoint trained without the top camera is run without it.
</div>
