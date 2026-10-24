---
layout: robot-policy
title: B-spline Policy on the NexArm
model_name: BSP
full_name: B-spline Policy, Diffusion Policy with B-spline actions
description: A Diffusion Policy that denoises the knots and control points of a cubic B-spline instead of a list of actions; the controller samples the curve at 100 Hz and can run it several times faster.
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
    value: 16 × (1 + D)
  - label: fit tolerance ε
    value: "0.002"
steps:
  - id: overview
    title: One control cycle
    body: >-
      B-spline Policy (BSP) keeps a standard Diffusion Policy and changes what it generates. Instead of a list of future
      joint targets, it denoises the **parameters of a curve**: 16 knots and their control points, which define one
      cubic B-spline segment. The controller samples that curve at 100 Hz. It can also move along it *n* times faster,
      and when the next segment arrives it is joined at the point that matches where the arm actually is. This page
      follows the "Diff.+BSP" variant, the one implemented in the released code and in our `bspline-policy` fork; it has
      not been trained on the NexArm yet.
    formulas:
      - '[\hat U ;\ \hat C] \sim \pi_\theta\big(\cdot \mid o_{t-1},\ o_t\big),\qquad [\hat U ;\ \hat C] \in \mathbb{R}^{16 \times (1 + D)}'
      - 'a(u) = \sum_i N_{i,3}(u)\, c_i'
    where: >-
      *o* is one observation (camera frames and joint state); the policy sees the last two. Column 0 holds the 16 knots
      Û, the other *D* columns the control points Ĉ (*D* = 6 on the NexArm). *N*<sub>i,3</sub> are the cubic
      B-spline basis functions those knots define.
    shapes: "2 observations → segment 16 × (1 knot + D)"
    stage:
      shot: hero
      cams: true
      chunk: true
  - id: observe
    title: Observe
    body: >-
      The policy reads the last two observations, each with every camera frame and the joint state, as Diffusion Policy
      does. The paper uses absolute joint positions as actions on its real arms, which matches the NexArm's joint-target
      interface. Two clocks run at once. The policy produces a new segment about 10 times a second, and the controller sends a command 100 times a
      second by sampling the current segment.
    formulas:
      - 'f_{\text{policy}} = 10\ \text{Hz},\qquad f_{\text{control}} = 100\ \text{Hz}'
    where: >-
      The next segment is inferred asynchronously while the arm is still running the current one. The paper samples at
      100 Hz; the released rollout script defaults to 200 Hz.
    shapes: "n_obs_steps 2 · images 84×84, random 76×76 crops · state"
    bounds: [16, 106, 518, 304]
    stage:
      shot: front
      cams: true
      frustums: true
  - id: network
    title: Diffusion Policy
    body: >-
      The network is Diffusion Policy's: a ResNet18 encoder with GroupNorm turns the images into a feature vector, which
      together with the joint state conditions a 1-D temporal UNet through FiLM. Starting from pure noise, the UNet
      removes noise from a 16-row matrix in 16 DDIM steps. The only change BSP makes is one extra channel: column 0 of
      every row is a knot, the other columns are a control point.
    formulas:
      - 'x^{K} \sim \mathcal{N}(0, I),\qquad x^{k-1} = \operatorname{DDIM}\big(x^{k},\ \epsilon_\theta(x^{k}, k, o)\big)'
      - 'x^{0} = [\hat U ;\ \hat C] \in \mathbb{R}^{16 \times (1 + D)}'
    where: >-
      ε<sub>θ</sub> is the UNet (down dims 256, 512, 1024; kernel 5) predicting the added noise; *K* = 16 inference
      steps of a 100-step squared-cosine schedule.
    shapes: "obs features → UNet × 16 steps → 16 × (1 + D)"
    bounds: [546, 106, 518, 304]
    stage:
      shot: top
      cams: true
  - id: params
    title: Knots and control points
    body: >-
      The knots set *where in time* each piece of the curve begins and ends, and they do not have to be evenly spaced.
      The control points set *where the curve goes*: it follows them without passing through them. A segment is a chunk
      of 10 knots plus 3 boundary-support knots on each side, 16 rows in all. A cubic spline over 16 knots has 12
      control points, so the decoder uses the first 12 rows' control points and ignores the last 4. Nothing forces the
      generated knots to be ordered, so any knot that would go backwards is pushed just past its neighbour.
    formulas:
      - 'u_i \leftarrow \max(u_i,\ u_{i-1} + \delta)'
    where: >-
      δ is a small positive constant. In practice the paper finds that predicted knots are almost always in order
      already.
    shapes: "chunk 10 + 2 × 3 support = 16 knots · 12 control points used"
    bounds: [1076, 106, 518, 304]
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
    bounds: [16, 426, 518, 304]
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
    bounds: [546, 426, 518, 304]
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
    bounds: [1076, 426, 518, 304]
    stage:
      shot: hero
      chunk: true
      joints: true
training_steps:
  - id: overview
    title: One training step
    body: >-
      Training is ordinary Diffusion Policy training with different targets. Every demonstration is first converted into
      a B-spline with an adaptive fit. At each observation the target is the next 16 knots and their control points, and
      the UNet learns to denoise them. The figures use a toy single-joint trajectory; the fitting, the windows and the
      basis functions are computed from it, not drawn by hand.
    formulas:
      - '\mathcal{L} = \mathbb{E}_{k,\ \epsilon}\ \big\lVert \epsilon_\theta\big(x^{k}, k, o\big) - \epsilon \big\rVert^2,\qquad x^{0} = [U ; C]'
    where: >-
      *x*<sup>k</sup> is the target matrix with noise of level *k* added; ε is that noise.
  - id: t-data
    title: Demonstrations
    body: >-
      A demonstration is a list of joint targets at a fixed rate. The paper records 200 to 300 teleoperated
      demonstrations per real task. A pick-and-place has fast, coarse parts (reach, carry, retreat) and slow, precise
      parts (grasp, place). A fixed-rate chunk spends the same resolution on both.
    formulas:
    shapes: "toy · one joint · 50 Hz · 8 s · 401 samples"
    bounds: [16, 106, 518, 398]
  - id: t-fit
    title: Adaptive B-spline fit
    body: >-
      Algorithm 1 of the paper starts with no interior knots and fits a cubic B-spline by least squares. It checks the
      largest error and, if it is above the tolerance, inserts a knot where the residual is largest (the FITPACK
      criterion), then repeats. The code does this with SciPy's FITPACK knot generator and `make_lsq_spline`. Knots end up where the motion bends and are sparse where it is simple.
    formulas:
      - 'E = \max_i \lVert a(t_i) - a_i \rVert \le \varepsilon'
    where: >-
      The paper and the fork's real-robot config use ε = 0.002 (`max_error`) to keep precise motions. The toy fit uses ε = 0.004 rad and needs 41
      knots for 401 samples.
    bounds: [546, 106, 518, 398]
  - id: t-target
    title: Fixed-size targets
    body: >-
      Observations do not line up with knots, so at each observation step the target is the nearest future window of
      16 knots and their control points. Because knot spacing varies, 16 knots can cover a long time where the motion
      is simple and a short time where it is detailed. Near the end of an episode the last control point is repeated to
      fill the window.
    formulas:
    shapes: "16 × (1 + D) per sample · knots stored as absolute times"
    bounds: [1076, 106, 518, 398]
  - id: t-loss
    title: Denoising loss
    body: >-
      As in Diffusion Policy, a random noise level is picked, that much noise is added to the target matrix, and the
      UNet, conditioned on the observations, predicts the noise. The loss is the squared error of that prediction. The
      knot column is learned exactly like the control points. For a fair comparison, the paper's chunking baselines
      predict 16 future actions with the same visual encoder and the same number of epochs.
    formulas:
    where: >-
      AdamW, lr 10<sup>-4</sup> with 500 warm-up steps and a cosine schedule, batch 64, EMA of the weights.
    bounds: [16, 520, 518, 398]
  - id: t-compare
    title: 16 actions vs 16 knots
    body: >-
      A 16-step chunk at 10 Hz always covers 1.6 s at an even spacing. The 16 knots of a segment are placed by the fit,
      so detail goes where the trajectory needs it. This is the "adaptive temporal resolution" the paper argues fixed
      chunks lack.
    formulas:
    bounds: [546, 520, 518, 398]
  - id: t-eps
    title: Fit tolerance
    body: >-
      A looser tolerance needs fewer knot–control-point pairs. On Push-T the compression ratio rises from 1.12× at
      ε = 0.5 to 3.34× at ε = 8, while the score stays between 0.52 and 0.65. Performance is not very sensitive to ε
      within a sensible range. These are the paper's numbers (Table 3); Push-T actions are pixel positions up to about
      512, which is why ε is so much larger there.
    formulas:
    bounds: [1076, 520, 518, 398]
results:
  measured: false
  summary: >-
    BSP has not been trained or run on the NexArm yet. The planned evaluation is the same as for ACT and TurboVLA, plus
    the speedup at which success starts to fall. For reference, the paper reports Diffusion Policy results on 6-DoF ARX5
    arms. At 4×, BSP cut Cube Picking from 3.52 s to 2.45 s (20/20 both) and Table Cleaning from 23.31 s to 18.05 s
    (12/20 vs 11/20). At 1×, it raised Table Cleaning success from 11/20 to 15/20. On bimanual Speed Stacking at 4× it
    was faster (9.62 s vs 10.49 s) but succeeded less often (7/20 vs 9/20).
  metrics:
    - name: Stacking success rate
      method: Fraction of trials that end with the bowls nested and released, judged from the front camera.
    - name: Time to stack
      method: Seconds from the first action to the gripper opening over the stack, successful trials only.
    - name: Achieved speedup
      method: Time to stack at 1× divided by time to stack at the target speedup (2×, 4×).
    - name: Command smoothness
      method: Peak joint acceleration of the executed commands, BSP vs the plain Diffusion Policy chunk at the same speed.
  protocol:
    - Fixed bowl start poses drawn from the recorded workspace, the same list for every policy.
    - Each policy is run at 1×, 2× and 4×; for the chunk baseline the speedup is a faster command rate.
    - A trial ends at success, at a collision, or after 60 seconds.
links:
  - label: "B-spline Policy: Accelerating Manipulation Policies via B-spline Action Representations"
    url: https://arxiv.org/abs/2607.09648
    note: Han, Xiong et al., 2026
  - label: Project page
    url: https://b-spline-policy.github.io/
    note: videos of the real-robot runs
  - label: bspline-policy (fork)
    url: https://github.com/khanhthanhdev/bspline-policy
    note: the Diffusion Policy implementation this page follows
  - label: lerobot-nexarm
    url: https://github.com/khanhthanhdev/lerobot-nexarm
    note: robot, simulation and training code
---

## Architecture

BSP is a change of action representation, not a new network. The paper adds it to two backbones, Diffusion Policy ("Diff.+BSP") and an ACT-style regression transformer ("Reg.+BSP"). The released code, and our fork of it, implement the Diffusion Policy variant, so this page follows that one.

| Part         | Setting in the `bspline-policy` code                                           |
| ------------ | ------------------------------------------------------------------------------ |
| Backbone     | Diffusion Policy: ResNet18 encoder with GroupNorm, 1-D UNet with FiLM          |
| Observations | last 2 steps; images 84 × 84 with 76 × 76 random crops                         |
| Denoising    | DDIM, 100 training steps, 16 inference steps, ε-prediction                     |
| Output       | 16 × (1 + D): knot in column 0, control point in the rest                      |
| Segment      | chunk 10 + 3 support knots per side; 12 control points used                    |
| Spline       | cubic (degree 3) B-spline                                                      |
| Action space | absolute joint positions on the real arms                                      |
| Rates        | data 10 Hz; controller samples the curve at 100 Hz (paper) or 200 Hz (default) |
| Speedup      | `a_exec(t) = a(n t)`, `--speed-up-times` 1, 2 or 4                             |
| Segment join | align to the last executed action within half a segment                        |

## Training

Demonstrations are converted once, before training: each trajectory is fitted with a cubic B-spline by FITPACK knot insertion until the largest error is below ε = 0.002, and the result is cut into 16-knot windows. The UNet then learns to denoise those windows, in the same place where Diffusion Policy would denoise an action chunk.

| Setting    | Value                                                               |
| ---------- | ------------------------------------------------------------------- |
| Fit        | SciPy FITPACK knots + least squares, `max_error` 0.002              |
| Target     | nearest future 16 knots + control points, last point repeated       |
| Loss       | squared error of the predicted noise                                |
| Optimizer  | AdamW, lr 1e-4, betas (0.95, 0.999), 500 warm-up steps, cosine, EMA |
| Baselines  | 16-action chunks, same encoder, same number of epochs               |
| Real tasks | Cube Picking, Table Cleaning, Speed Stacking; 200–300 demos each    |

<div class="rp-callout" markdown="1">
**Not trained on the NexArm yet.** The architecture and settings come from the `bspline-policy` code and the paper. The figures use a toy single-joint trajectory: the fit, the knot windows, the basis functions and the alignment are computed from it, but it is not a NexArm recording.
</div>
