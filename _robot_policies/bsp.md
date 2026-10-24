---
layout: robot-policy
title: B-spline Policy on the NexArm
model_name: BSP
full_name: B-spline Policy, ACT with a B-spline action head
description: The ACT network with a different output. Instead of 16 actions it predicts 16 knots and control points of a cubic B-spline, which the controller samples at 100 Hz and can run several times faster.
order: 3
policy:
  horizon: 100
  execute: 10
  fps: 100
facts:
  - label: knots per segment
    value: "16"
  - label: spline degree
    value: cubic
  - label: policy rate
    value: 10 Hz
  - label: control rate
    value: 100 Hz
  - label: output per segment
    value: 16 × 7
  - label: fit tolerance ε
    value: "0.002"
steps:
  - id: overview
    title: One control cycle
    body: >-
      B-spline Policy (BSP) keeps the network from the ACT page and changes what comes out of it. Instead of a list of
      future joint targets, the head predicts the **parameters of a curve**: 16 knots and their control points, which
      define one cubic B-spline segment. The controller samples that curve at 100 Hz. It can also move along it
      *n* times faster, and when the next segment arrives it is joined at the point that matches where the arm actually
      is. This page follows the paper's "Reg.+BSP" setup, the ACT-style variant; it has not been trained on the NexArm
      yet.
    formulas:
      - '[\hat U ;\ \hat C] = \pi_\theta\big(I_t^{1..V},\ s_t\big) \in \mathbb{R}^{16 \times (1 + 6)}'
      - 'a(u) = \sum_i N_{i,3}(u)\, c_i'
    where: >-
      Û are 16 knot values and Ĉ the matching control points, one six-number joint target each. *N*<sub>i,3</sub> are
      the cubic B-spline basis functions those knots define.
    shapes: "images V × 3×H×W · state 6 → segment 16 × (1 knot + 6)"
    stage:
      shot: hero
      cams: true
      chunk: true
  - id: observe
    title: Observe
    body: >-
      The inputs are the same as for ACT: one frame per camera and the six-number joint state. The paper uses absolute
      joint positions as actions on its real arms, which matches the NexArm's joint-target interface. Two clocks run at
      once. The policy produces a new segment about 10 times a second, and the controller sends a command 100 times a
      second by sampling the current segment.
    formulas:
      - 'f_{\text{policy}} = 10\ \text{Hz},\qquad f_{\text{control}} = 100\ \text{Hz}'
    where: >-
      The next segment is inferred asynchronously while the arm is still running the current one.
    shapes: "observation.images.* · observation.state 6"
    bounds: [30, 96, 1340, 214]
    stage:
      shot: front
      cams: true
      frustums: true
  - id: network
    title: ACT-style network
    body: >-
      The backbone is a regression transformer like the one on the ACT page. In the paper's real-robot runs the image
      encoder is DINOv2. The head now outputs 16 knot values and their 6-D control points instead of 16 actions. The
      paper does not say how this maps onto the query slots; the figure shows one natural layout, one knot and one
      control point per slot. Either way the output is a fixed-size tensor, so a chunking backbone can take it with
      little change.
    formulas:
      - '\hat y_k = W_{\text{out}}\, q_k \in \mathbb{R}^{7},\qquad k = 1, \dots, 16'
      - '[\hat u_k ;\ \hat c_k] = \hat y_k'
    where: >-
      *q*<sub>k</sub> is the decoder output for slot *k*; the first number is the knot, the other six the control point.
    shapes: "16 query slots → Linear → 16 × 7"
    bounds: [30, 330, 540, 450]
    stage:
      shot: top
      cams: true
  - id: params
    title: Knots and control points
    body: >-
      The knots set *where in time* each piece of the curve begins and ends, and they do not have to be evenly spaced.
      The control points set *where the curve goes*: it follows them without passing through them. A cubic segment needs
      neighbouring knots for support, and 6 of the 16 are boundary-support knots; the inner ones bound the part that
      runs. The paper gives only the total, so the figure draws them as 3 on each side, the usual split for a cubic. A regressor does not guarantee ordered knots, so any knot that would go backwards is pushed just past
      its neighbour.
    formulas:
      - 'u_i \leftarrow \max(u_i,\ u_{i-1} + \delta)'
    where: >-
      δ is a small positive constant. In practice the paper finds that predicted knots are almost always in order
      already.
    shapes: "U 16 non-decreasing · C 16 × 6"
    bounds: [580, 330, 800, 450]
    stage:
      shot: chunk
      chunk: true
  - id: basis
    title: A weighted sum with local support
    body: >-
      Each control point is weighted by a basis function that is non-zero over only four knot spans. Moving one control
      point therefore reshapes only that part of the curve, which the lower plot shows. An error in one predicted
      parameter bends one piece and leaves the rest of the segment unchanged. Cubic pieces also meet with continuous
      velocity and acceleration, so the commanded motion has no corners.
    formulas:
      - 'N_{i,0}(u) = \begin{cases} 1 & u_i \le u < u_{i+1} \\ 0 & \text{otherwise} \end{cases}'
      - 'N_{i,p}(u) = \frac{u - u_i}{u_{i+p} - u_i} N_{i,p-1}(u) + \frac{u_{i+p+1} - u}{u_{i+p+1} - u_{i+1}} N_{i+1,p-1}(u)'
    where: >-
      The Cox–de Boor recursion, with *p* = 3. *N*<sub>i,3</sub> is zero outside [*u*<sub>i</sub>, *u*<sub>i+4</sub>).
    shapes: "a(u) ∈ ℝ⁶ for any u in the segment"
    bounds: [30, 790, 920, 570]
    stage:
      shot: side
      joints: true
  - id: rescale
    title: Sample at 100 Hz, run n× faster
    body: >-
      The curve is defined for every *u*, not only at the recorded steps. The controller can therefore sample it as
      densely as it likes, and it can speed the motion up by scaling time. At 2× the arm follows the same path in half
      the time with half as many samples. The policy is not retrained for each speed. The limit is the hardware: at 4×
      the paper's low-cost arms could no longer track the bimanual Speed Stacking task.
    formulas:
      - 'a_{\text{exec}}(t) = a(n\,t)'
    where: >-
      *n* is the speedup factor and *t* is real time since the segment started.
    shapes: "1× · 100 samples per second of curve · n× · 100 / n"
    bounds: [960, 790, 420, 570]
    stage:
      shot: chunk
      chunk: true
  - id: align
    title: Join the next segment smoothly
    body: >-
      By the time a new segment arrives, the arm has moved on, and noise and tracking error mean the new curve does not
      start exactly where the old one is. Switching at a fixed time would make the command jump. BSP instead searches the
      start of the new segment for the point closest to the last executed action, and continues from there. Without this
      step, Speed Stacking success at 4× falls from 35 % to 15 % in the paper's ablation, which uses the Diffusion
      backbone.
    formulas:
      - 't^{\star} = \arg\min_{0 \le t \le \lambda T_{\text{inf}}} \operatorname{MSE}\big(S_{\text{new}}(t),\ a_{\text{last}}\big)'
    where: >-
      *T*<sub>inf</sub> is the measured inference latency and λ > 1 widens the window. On the real arms the window is
      half the segment: λ*T*<sub>inf</sub> = *u*<sub>max</sub>(*S*) / 2.
    shapes: "no jump at segment boundaries"
    bounds: [30, 1380, 1340, 200]
    stage:
      shot: hero
      chunk: true
      joints: true
training_steps:
  - id: overview
    title: One training step
    body: >-
      Training is ordinary behaviour cloning with different targets. Every demonstration is first converted into a
      B-spline with an adaptive fit. At each observation the target is the next 16 knots and their control points, and
      the network regresses them. The figures use a toy single-joint trajectory; the fitting, the windows and the
      basis functions are computed from it, not drawn by hand.
    formulas:
      - '\min_\theta\ \mathbb{E}_{(o, U, C)}\ \mathcal{L}\big(\pi_\theta(o),\ [U ; C]\big)'
    where: >-
      The paper does not state the loss *ℒ* for the regression variant; ACT's L1 is the natural drop-in.
  - id: t-data
    title: Demonstrations
    body: >-
      A demonstration is a list of joint targets at a fixed rate. The paper records 200 to 300 teleoperated
      demonstrations per real task. A pick-and-place has fast, coarse parts (reach, carry, retreat) and slow, precise
      parts (grasp, place). A fixed-rate chunk spends the same resolution on both.
    formulas:
    shapes: "toy · one joint · 50 Hz · 8 s · 401 samples"
    bounds: [30, 96, 620, 340]
  - id: t-fit
    title: Adaptive B-spline fit
    body: >-
      Algorithm 1 of the paper starts with no interior knots and fits a cubic B-spline by least squares. It checks the
      largest error and, if it is above the tolerance, inserts a knot where the residual is largest (the FITPACK
      criterion), then repeats. Knots end up where the motion bends and are sparse where it is simple.
    formulas:
      - 'E = \max_i \lVert a(t_i) - a_i \rVert \le \varepsilon'
    where: >-
      The paper uses ε = 0.002 on its real tasks to keep precise motions. The toy fit uses ε = 0.004 rad and needs 41
      knots for 401 samples.
    bounds: [670, 96, 700, 340]
  - id: t-target
    title: Fixed-size targets
    body: >-
      Observations do not line up with knots, so at each observation step the target is the nearest future window of
      16 knots and their control points. Because knot spacing varies, 16 knots can cover a long time where the motion
      is simple and a short time where it is detailed. Near the end of an episode the last control point is repeated to
      fill the window.
    formulas:
    shapes: "16 knots + 16 control points per sample"
    bounds: [30, 446, 620, 324]
  - id: t-loss
    title: Regress the parameters
    body: >-
      The network predicts the 16 × 7 parameters and is trained against the fitted ones, exactly where ACT would be
      trained against a 16-step action chunk. For a fair comparison, the paper's chunking baselines also predict 16
      future actions, with the same visual encoder and the same number of epochs.
    formulas:
    bounds: [670, 446, 700, 324]
  - id: t-compare
    title: 16 actions vs 16 knots
    body: >-
      A 16-step chunk at 10 Hz always covers 1.6 s at an even spacing. The 16 knots of a segment are placed by the fit,
      so detail goes where the trajectory needs it. This is the "adaptive temporal resolution" the paper argues fixed
      chunks lack.
    formulas:
    bounds: [30, 780, 640, 330]
  - id: t-eps
    title: Fit tolerance
    body: >-
      A looser tolerance needs fewer knot–control-point pairs. On Push-T the compression ratio rises from 1.12× at
      ε = 0.5 to 3.34× at ε = 8, while the score stays between 0.52 and 0.65. Performance is not very sensitive to ε
      within a sensible range. These are the paper's numbers (Table 3); Push-T actions are pixel positions up to about
      512, which is why ε is so much larger there.
    formulas:
    bounds: [690, 780, 680, 330]
results:
  measured: false
  summary: >-
    BSP has not been trained or run on the NexArm yet. The planned evaluation is the same as for ACT and TurboVLA, plus
    the speedup at which success starts to fall. For reference, the paper reports results on 6-DoF ARX5 arms. With the
    ACT-style backbone at 4×, BSP halved the average Table Cleaning time from 23.57 s to 11.80 s (14/20 vs 13/20
    successes). At 1×, it raised Speed Stacking success from 8/20 to 16/20, but at 4× the bimanual task failed
    completely because the arms could not track the faster commands.
  metrics:
    - name: Stacking success rate
      method: Fraction of trials that end with the bowls nested and released, judged from the front camera.
    - name: Time to stack
      method: Seconds from the first action to the gripper opening over the stack, successful trials only.
    - name: Achieved speedup
      method: Time to stack at 1× divided by time to stack at the target speedup (2×, 4×).
    - name: Command smoothness
      method: Peak joint acceleration of the executed commands, BSP vs the ACT chunk baseline at the same speed.
  protocol:
    - Fixed bowl start poses drawn from the recorded workspace, the same list for every policy.
    - Each policy is run at 1×, 2× and 4×; for ACT the baseline speedup is a faster command rate.
    - A trial ends at success, at a collision, or after 60 seconds.
links:
  - label: "B-spline Policy: Accelerating Manipulation Policies via B-spline Action Representations"
    url: https://arxiv.org/abs/2607.09648
    note: Han, Xiong et al., 2026
  - label: Project page
    url: https://b-spline-policy.github.io/
    note: videos of the real-robot runs
  - label: lerobot-nexarm
    url: https://github.com/khanhthanhdev/lerobot-nexarm
    note: robot, simulation and training code
---

## Architecture

BSP is a change of action representation, not a new network. The paper adds it to two backbones, Diffusion Policy ("Diff.+BSP") and an ACT-style regression transformer ("Reg.+BSP"). This page follows the second, because it is the closest to the ACT policy already on the NexArm.

| Part          | Setting in the paper                                                   |
| ------------- | ---------------------------------------------------------------------- |
| Backbone      | ACT-style regression transformer; DINOv2 image encoder on real robots  |
| Output        | 16 knots and their control points, 6 of the knots are boundary support |
| Spline        | cubic (degree 3) B-spline                                              |
| Action space  | absolute joint positions on the real arms                              |
| Rates         | policy about 10 Hz, controller samples the curve at 100 Hz             |
| Speedup       | `a_exec(t) = a(n t)`, n = 1, 2 or 4 in the experiments                 |
| Segment join  | align to the last executed action within half a segment                |
| Knot validity | `u_i ← max(u_i, u_{i-1} + δ)`                                          |

## Training

Demonstrations are converted once, before training: each trajectory is fitted with a cubic B-spline by adaptive knot insertion until the largest error is below ε = 0.002. The network then regresses the next 16 knots and their control points at every observation step, in the same place where ACT regresses its action chunk.

| Setting    | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| Fit        | FITPACK-style knot insertion, ε = 0.002 (Push-T: ε = 1)          |
| Target     | nearest future 16 knots + control points, last point repeated    |
| Baselines  | 16-action chunks, same encoder, same number of epochs            |
| Real tasks | Cube Picking, Table Cleaning, Speed Stacking; 200–300 demos each |
| Simulation | Push-T, RoboMimic, RoboCasa                                      |

<div class="rp-callout" markdown="1">
**Not trained on the NexArm yet.** The architecture, the rates and the numbers on this page come from the paper. The figures use a toy single-joint trajectory: the fit, the knot windows, the basis functions and the alignment are computed from it, but it is not a NexArm recording.
</div>
