---
layout: robot-policy
title: DEM on the NexArm
model_name: DEM
full_name: DEM, the Decoupled Embodiment Model
description: A DINOv3 ConvNeXt-B and a frozen NeoBERT feed 801 context tokens to a 107M MeanFlow head, which turns noise into 16 actions in one forward pass; the NexArm runs 8 before looking again.
order: 4
policy:
  horizon: 16
  execute: 8
  fps: 20
facts:
  - label: actions per chunk
    value: "16"
  - label: actions run before re-planning
    value: "8"
  - label: control rate
    value: 20 Hz
  - label: context tokens (3 cameras)
    value: "801"
  - label: backbone
    value: DINOv3 ConvNeXt-B
  - label: action head
    value: 107M MeanFlow
  - label: sampling steps
    value: "1"
  - label: training updates
    value: 20k
steps:
  - id: overview
    title: One control cycle
    body: >-
      DEM reads the cameras, the joint state and the task instruction, and **generates** a chunk of 16 actions instead of
      regressing one. A vision encoder, a language encoder and an action head are three separate networks: the head
      reads the other two only through cross-attention. It starts from Gaussian noise and removes it in a single step,
      so sampling costs one forward pass. The NexArm runs the first 8 actions, 0.4 seconds, then looks again.
    formulas:
      - '\hat{A}_t = \varepsilon - u_\theta\big(\varepsilon,\ r{=}0,\ t{=}1 \mid C(I_t^{1..V},\ \ell,\ s_t)\big),\quad \varepsilon \sim \mathcal{N}(0, I)'
    where: >-
      *C* is the context built from *V* camera views, the instruction ℓ and the six-number joint state; *u*<sub>θ</sub> is
      the average velocity the head predicts over the whole interval from noise (*t* = 1) to data (*r* = 0). The result
      is 16 rows of five joint targets and a gripper target, z-scored.
    shapes: "images V × 3×256×256 · text 32 tokens · state 6 → chunk 16 × 6"
    detail: |-
      A regressor such as ACT or TurboVLA predicts one chunk per observation. When the demonstrations show two ways to do
      the same thing, an L1 or L2 loss pulls it towards the average of the two, which may be neither. A generative head
      learns the whole distribution of chunks instead and samples one of them.

      Diffusion and flow-matching policies pay for that with many network passes per chunk. DEM uses **MeanFlow**: the head
      learns the average velocity over an interval rather than the instantaneous one, so the whole path from noise to an
      action chunk is a single step. On the rollout computer's RTX 5050 one 16-action chunk with three cameras takes
      22 ms and 1.8 GB.

      "Decoupled" refers to the three towers: the vision and language encoders know nothing about the robot, and only the
      head, which reads them through cross-attention, is specific to this arm.
    stage:
      shot: hero
      cams: true
      chunk: true
  - id: observe
    title: Observe
    body: >-
      Every camera frame arrives as a float image in [0, 1] and is resized to 256 × 256 with antialiasing, in the order
      front, wrist, top. The joint state is z-scored with the dataset's mean and standard deviation. ImageNet
      normalization happens later, inside the vision encoder.
    formulas:
      - '\tilde{s} = (s - \mu_s) \oslash \sigma_s'
      - '\tilde{I} = \operatorname{resize}_{256}(I),\quad I \in [0, 1]^{3 \times 480 \times 640}'
    where: >-
      μ<sub>s</sub>, σ<sub>s</sub> come from the training set and are saved with the checkpoint. The camera order is
      `--policy.camera_keys`, or the dataset's order when it is empty.
    shapes: "V = 3 views · 640×480 → 256×256 · state 6 z-scored"
    detail: |-
      The paper scales state and action in two stages: to [-1, 1] with the 1st and 99th percentiles, then z-scores the
      result. Both stages are affine per dimension, so together they are one affine map, and LeRobot's plain z-score on the
      raw values gives exactly the same numbers. The plugin therefore uses LeRobot's normalizer and leaves the model's own
      normalizers as the identity.

      On the real NexArm data the per-joint standard deviations are 113 to 407 servo ticks, so no joint's z-score is close to
      dividing by zero.
    bounds: [16, 106, 408, 304]
    stage:
      shot: front
      cams: true
      frustums: true
  - id: vision
    title: DINOv3 ConvNeXt-B
    body: >-
      Each view goes through DINOv3 ConvNeXt-B on its own, under bf16 autocast. DEM takes the **stage-3** feature map, at
      stride 16: a 256-pixel image becomes a 16 × 16 grid of 512-wide features, flattened row by row into 256 tokens. The
      encoder is fine-tuned with the head, at half the head's learning rate.
    formulas:
      - 'F = \operatorname{ConvNeXt}_{\le 3}(\tilde I) \in \mathbb{R}^{512 \times 16 \times 16}'
      - 'V = \operatorname{flatten}(F)^{\top} \in \mathbb{R}^{256 \times 512}'
      - 'N_v = V_{\text{cams}} \cdot (256 / 16)^2 = 256\,V_{\text{cams}}'
    where: >-
      ConvNeXt has four stages with strides 4, 8, 16 and 32. The final stage would give 8 × 8 tokens of width 1024;
      stage 3 keeps four times as many, smaller ones.
    shapes: "V × 3×256×256 → V × 512×16×16 → 768 × 512 with 3 views"
    detail: |-
      Most VLAs use a vision transformer. ConvNeXt is a convolutional network with transformer-style design choices, and the
      DINOv3 version is trained by the same self-supervised method as DINOv3's ViTs, so its features carry the same
      knowledge of where things are. A convolutional backbone keeps a spatial grid at every stage, which is why DEM can stop
      at stage 3 and keep a finer grid than the final layer gives.

      Stage-3 tokens are a compromise between detail and cost. 256 tokens per view are enough to locate the bowls and the
      gripper, and the head's cross-attention over three views stays cheap.
    bounds: [424, 106, 408, 304]
    stage:
      shot: top
      cams: true
      frustums: true
  - id: language
    title: Frozen NeoBERT
    body: >-
      The instruction, such as "stack the red, blue and black bowls", is tokenized and encoded by NeoBERT, a modern BERT
      encoder that stays frozen. DEM keeps 32 tokens of width 768, special tokens included, with a mask over padding.
      Each distinct instruction is encoded once and reused.
    formulas:
      - 'L = \operatorname{NeoBERT}(\ell)_{[1:32]} \in \mathbb{R}^{32 \times 768}'
      - 'm_j = \begin{cases} 1 & \text{token } j \text{ is real} \\ 0 & \text{token } j \text{ is padding} \end{cases}'
    where: >-
      An empty task falls back to `--policy.default_task`. The mask keeps padding out of every cross-attention that reads
      the language tokens.
    shapes: "instruction → 32 × 768 · frozen"
    detail: |-
      Freezing the language encoder keeps what it learned from text and costs nothing in memory at training time, since its
      activations need no gradient. It still ships in the checkpoint (1.6 GB with it), so loading a trained policy needs no
      Hub download apart from the tokenizer.

      Instruction following was the first thing to fail on the NexArm. With the paper's head, six stacking orders that only
      the prompt tells apart gave the same chunk: across the six prompts the chunk changed by 0.3 servo ticks, against 25
      between two noise draws. The next steps explain why, and what the plugin changes.
    bounds: [832, 106, 408, 304]
    stage:
      shot: hero
      cams: false
      chunk: false
  - id: context
    title: Build the context
    body: >-
      The three kinds of tokens are projected to the head's width of 768, tagged with a learned embedding for their
      modality and concatenated. The joint state becomes a single token. With three cameras this context holds **801
      tokens**: 768 image tokens, 32 language tokens and one state token.
    formulas:
      - 'C = \big[\ V W_v + e_v \ \Vert\ L W_l + e_l \ \Vert\ \tilde s\, W_p + e_p\ \big]'
      - 'N_C = 256 \cdot 3 + 32 + 1 = 801'
    where: >-
      *W*<sub>v</sub> is 512 → 768, *W*<sub>l</sub> is 768 → 768 and *W*<sub>p</sub> is 6 → 768; *e*<sub>v</sub>,
      *e*<sub>l</sub>, *e*<sub>p</sub> are learned modality vectors. With action history on, 10 more tokens are appended.
    shapes: "768 + 32 + 1 = 801 tokens × 768"
    detail: |-
      The context is the head's only view of the observation in the paper's design. That is a weakness on the NexArm: the
      instruction is 32 of 801 tokens and the state is 1, and cross-attention can learn to read the image tokens and
      ignore the rest. A head trained that way stacked the bowls in a fixed order whatever the prompt said.

      With **action history** (TEMPO-ACT, off by default), the mean normalized action of each of the last 10 seconds joins
      the context as 10 more tokens with a learned position each. A single frame cannot say which bowl comes next; the
      gripper's past closings can.
    bounds: [1240, 106, 408, 304]
    stage:
      shot: side
      cams: true
  - id: global
    title: Global conditioning (NexArm)
    body: >-
      The plugin adds a second path for the instruction and the state. Four learned queries pool the language tokens by
      attention, the state is projected, and an MLP turns both into one vector *g*. It is added to the time embedding
      that modulates **every** head block through adaptive layer norm, so the head cannot ignore it.
    formulas:
      - 'g = \operatorname{MLP}\Big(\operatorname{LN}\big[\ \operatorname{Pool}_{k=1..4}(L W) \ \Vert\ \tilde s\, W_q\ \big]\Big)'
      - 'c = \operatorname{emb}_r(r) + \operatorname{emb}_t(t) + g'
    where: >-
      The last layer of the MLP starts at zero, so at step 0 the head computes exactly the paper's head. `--policy.global_conditioning=false`
      restores the paper.
    shapes: "4 queries × 768 + state 768 → g · 768"
    detail: |-
      Attention pooling rather than a plain mean: the stacking prompts share most of their words, and a mean is dominated by
      the shared ones. Learned queries can attend to the colour words that differ.

      With this change the state was used at once: swapping the state changed the chunk by 282 ticks, against 1.2 with the
      paper's head. The instruction was still too weak to separate six stacking orders (0.7 ticks), which is why the
      reported runs train on a single order.
    bounds: [16, 426, 408, 304]
    stage:
      shot: side
      joints: true
  - id: head
    title: MeanFlow action head
    body: >-
      The noisy chunk enters as 16 action tokens with a learned position each. Eight blocks of width 768 with 12 heads
      process them. Each block is a DiT block, self-attention and an MLP modulated by *c* through adaptive layer norm,
      followed by gated cross-attention into the 801 context tokens. A final layer norm and linear layer give the average
      velocity *u*.
    formulas:
      - 'h \leftarrow h + \gamma_1(c) \odot \operatorname{SelfAttn}\big(\operatorname{LN}(h)(1 + \alpha_1(c)) + \beta_1(c)\big)'
      - 'h \leftarrow h + \gamma_2(c) \odot \operatorname{MLP}\big(\operatorname{LN}(h)(1 + \alpha_2(c)) + \beta_2(c)\big)'
      - 'h \leftarrow h + \lambda \odot \operatorname{CrossAttn}\big(\operatorname{LN}(h),\ C\big)'
      - 'u = W_{\text{out}}\,\operatorname{LN}(h) \in \mathbb{R}^{16 \times 6}'
    where: >-
      α, β, γ come from one zero-initialized linear layer on *c*; the per-channel gate λ starts at zero, as does
      *W*<sub>out</sub>. About 107M parameters (the paper's `new100m` size).
    shapes: "16 tokens × 768 → 8 × (AdaLN block + cross-attn) → 16 × 6"
    detail: |-
      Everything that can start at zero does. A fresh block is a plain transformer block with closed residual gates and no
      cross-attention, and the output is zero. Training opens each path only as far as it helps, which keeps the large
      pretrained features stable while the head is still random.

      Attention is written as explicit matrix products rather than a fused kernel. Training differentiates the head with a
      forward-mode Jacobian-vector product, which the fused attention kernels do not support.
    bounds: [424, 426, 408, 304]
    stage:
      shot: chunk
      chunk: true
  - id: sample
    title: One step from noise
    body: >-
      MeanFlow predicts the average velocity over an interval, so the displacement from *t* to *r* is a single product.
      Sampling uses the whole interval at once: draw noise ε, evaluate the head at *r* = 0 and *t* = 1, and subtract.
      Undoing the z-score gives joint and gripper targets.
    formulas:
      - 'z_r = z_t - (t - r)\,u(z_t, r, t)'
      - '\hat A = \varepsilon - u_\theta(\varepsilon,\ 0,\ 1 \mid C),\qquad A = \hat A \odot \sigma_a + \mu_a'
    where: >-
      `--policy.num_inference_steps` > 1 splits [1, 0] into equal parts and applies the same update per part; the paper and
      the plugin use 1.
    shapes: "ε 16 × 6 → 1 head pass → 16 × 6 actions"
    detail: |-
      Fresh noise for every chunk means two consecutive chunks can land in different modes of the distribution, and the arm
      jumps where one hands over to the next. Two rollout options make chunks agree without retraining:
      `--inference-noise fixed` draws one noise per episode and reuses it (`zero` starts from the noise mean), so the chunk
      depends on the observation alone; `--temporal-ensemble 0.01` predicts a chunk every step and runs the weighted mean of
      every chunk's prediction for that step, as in the ACT paper. The ensemble needs the 22 ms inference to fit inside one
      50 ms control step, which it does.
    bounds: [832, 426, 408, 304]
    stage:
      shot: chunk
      chunk: true
      joints: true
  - id: execute
    title: Run 8, then infer again
    body: >-
      The policy queues the first 8 of the 16 actions and returns one per control step at 20 Hz. When the queue is empty
      it captures new frames and runs the whole network again. In the 3D view, the dots ahead of the gripper are the
      actions still to run before the next inference.
    formulas:
      - '\Delta t_{\text{replan}} = 8 \times \tfrac{1}{20}\,\text{s} = 0.4\,\text{s}'
    shapes: "8 × 50 ms = 0.4 s between observations"
    detail: |-
      Like TurboVLA, DEM discards the second half of every chunk, the part predicted furthest ahead from an old view. At
      22 ms per chunk the network uses about 5 % of the 0.4 s it buys, so re-planning more often is affordable.

      With action history on, every action the policy returns is also remembered and averaged into the history buckets of
      later chunks. That needs the synchronous rollout engine (`lerobot-rollout`'s default), which calls the policy once per
      step; the RTC engine would leave the history empty.
    bounds: [1240, 426, 408, 304]
    stage:
      shot: hero
      chunk: true
      joints: true
training_steps:
  - id: overview
    title: One training step
    body: >-
      `lerobot-train` repeats this loop: load a chunk of 16 actions with the observation, mix it with noise at a random
      time, ask the head for the average velocity, compare it with a MeanFlow target computed from the head itself, add a
      dispersive term, and update the head and the vision encoder. NeoBERT stays frozen.
    formulas:
      - '\theta^{*} = \arg\min_\theta\ \mathbb{E}_{(o, x),\ \varepsilon,\ (r, t)}\ \Big[\ w\,\big\lVert u_\theta(z_t, r, t \mid o) - u_{\text{tgt}} \big\rVert^2\ \Big] + 0.25\,\mathcal{L}_{\text{disp}}'
    where: >-
      *o* is the observation, *x* the recorded chunk (z-scored), ε Gaussian noise and *w* an adaptive weight. The target
      *u*<sub>tgt</sub> is computed with a stop-gradient.
    detail: |-
      The real-arm run trains on the 147 training episodes of the real stacking set for 20,000 updates of 32 samples, about
      20 passes over the data. Three cameras at batch 32 do not fit in 24 GB, so each update accumulates two micro-batches
      of 16: 14.7 GB at 0.37 s per micro-batch on an RTX A5000.

      The model and loss defaults are the paper's. The conditioning and the learning rates are not, for reasons the steps
      below give.
  - id: t-data
    title: Real demonstrations, idle start cut
    body: >-
      164 teleoperated stacking episodes (20 fps, front, wrist and top cameras); the last 10 % are held out for the loss.
      Each episode is first trimmed to start 3 frames before the leader moves more than 10 ticks, which removes 11.9 %
      of the frames. Every sample loads the current observation and the next 16 actions.
    formulas:
      - '\text{action indices} = [\,-H, \dots, -1,\ 0, \dots, 15\,],\quad H = \text{buckets} \times \text{frames per bucket}'
    where: >-
      *H* = 0 by default. With action history, *H* = 10 × 20 = 200 past actions are loaded too and averaged per second.
      Steps past the episode end repeat its last action.
    shapes: "147 train · 17 held out · 32,016 training frames after trimming"
    detail: |-
      Every real episode began with about 1.6 seconds of the leader held still while recording ran, 13 % of all frames.
      Over those frames the images and the state barely change, yet the 16-step target goes from "hold" to "hold, then
      start", because only the operator knew when to start. A policy trained on them learns to hesitate at the rest pose.
      The still ends are kept: there the bowls are stacked and holding still is right.
    bounds: [16, 106, 518, 398]
  - id: t-noise
    title: Mix the chunk with noise
    body: >-
      Two times are drawn from a logit-normal distribution and sorted, *t* the larger and *r* the smaller. In half the
      samples *r* is set equal to *t*. The chunk *x* is interpolated linearly towards Gaussian noise; along that straight
      line the instantaneous velocity is known in closed form.
    formulas:
      - 'r, t = \operatorname{sort}\big(\sigma(n_1), \sigma(n_2)\big),\quad n_i \sim \mathcal{N}(-0.4,\ 1)'
      - 'z_t = (1 - t)\,x + t\,\varepsilon,\qquad v = \varepsilon - x'
    where: >-
      `ratio_r_eq_t` = 0.5 is the fraction with *r* = *t*. *t* = 0 is the data end and *t* = 1 the noise end.
    shapes: "x, ε, z_t · B × 16 × 6 · r, t · B"
    detail: |-
      When *r* = *t* the interval has zero length, the average velocity equals the instantaneous one, and the loss reduces to
      ordinary flow matching. Those samples anchor the head to the true velocity field; the samples with *r* < *t* teach it
      to jump across an interval, which is what makes one-step sampling possible.
    bounds: [546, 106, 518, 398]
  - id: t-target
    title: MeanFlow target
    body: >-
      Differentiating the definition of the average velocity gives the MeanFlow identity: the average velocity equals the
      instantaneous one minus (*t* − *r*) times its own rate of change. That rate is one Jacobian-vector product through
      the head, along the direction the sample moves.
    formulas:
      - 'u(z_t, r, t) = \frac{1}{t - r}\int_r^t v(z_\tau, \tau)\,d\tau'
      - '(u,\ \tfrac{du}{dt}) = \operatorname{jvp}\big(u_\theta,\ (z_t, r, t),\ (v, 0, 1)\big)'
      - 'u_{\text{tgt}} = \operatorname{sg}\big(v - (t - r)\,\tfrac{du}{dt}\big)'
    where: >-
      sg is the stop-gradient. `torch.func.jvp` gives *u* and *du*/*dt* in one forward-mode pass; the head, the JVP and the
      loss run in fp32 even when training autocasts the rest.
    shapes: "u, du/dt · B × 16 × 6"
    detail: |-
      The target depends on the network being trained, but the stop-gradient turns it into a fixed regression target for
      each step. The forward-mode JVP costs about one extra forward pass, far less than backpropagating through a sampler.

      It is also why attention in the head is written by hand: fused attention kernels do not support forward-mode
      differentiation.
    bounds: [1076, 106, 518, 398]
  - id: t-loss
    title: Adaptive loss and dispersion
    body: >-
      The squared error is weighted per sample by the inverse square root of its own size, so a few large errors cannot
      dominate the batch. A dispersive term on the head's middle hidden state pushes the representations of different
      samples apart.
    formulas:
      - '\delta = \tfrac{1}{16 \cdot 6}\lVert u_\theta - u_{\text{tgt}} \rVert^2,\qquad w = \operatorname{sg}\big((\delta + 10^{-3})^{-1/2}\big)'
      - '\mathcal{L}_{\text{disp}} = \log \operatorname{mean}_{i,j}\ e^{-\lVert f_i - f_j \rVert^2 / 0.5}'
      - '\mathcal{L} = \frac{\operatorname{mean}(w\,\delta)}{\operatorname{mean}(w)} + 0.25\,\mathcal{L}_{\text{disp}}'
    where: >-
      *f*<sub>i</sub> is sample *i*'s hidden state after the fifth of the eight blocks, averaged over the 16 tokens and normalized to unit
      length.
    shapes: "δ, w · B · L_disp ≤ 0"
    detail: |-
      The dispersive term is a log-mean-exp, so it is at most zero, and the total loss can go negative. The adaptive weight
      also divides out large errors. Both hide trouble, so the number to watch is `meanflow_mse`, the unweighted δ. With the
      paper's learning rates it spiked to 12,554 before the rate decayed; with the halved rates and warm-up the real run
      went from 1.95 to 0.06.
    bounds: [16, 520, 518, 398]
  - id: t-masks
    title: Hide history and views
    body: >-
      Two optional regularizers act on the conditioning. History dropout hides the whole action history in 20 % of the
      samples. View masking hides each listed camera's tokens from the head's cross-attention in 30 % of the samples.
    formulas:
      - '\text{history mask} \leftarrow \text{history mask} \wedge \neg\,b,\quad b \sim \operatorname{Bernoulli}(0.2)'
      - 'm^{\text{vis}}_{\text{cam}} \leftarrow 0 \ \text{for all 256 tokens},\quad \text{w.p. } 0.3 \text{ per listed camera}'
    where: >-
      `--policy.history_dropout`, `--policy.camera_dropout_keys` (front and top in the NexArm run) and
      `--policy.camera_dropout_prob`. Both need global conditioning.
    shapes: "history 10 tokens · 256 tokens per hidden camera"
    detail: |-
      Without history dropout the policy could lean on its own past motion and copy it, and it would never see the empty
      history of an episode's first second. View masking makes it act when the arm occludes a camera, or when a camera has
      moved since recording: `--hide-cameras front` at rollout hides that view on every call. On this data the same masking
      gave ACT its lowest held-out error, 64.7 against 71.0 ticks.
    bounds: [546, 520, 518, 398]
  - id: t-update
    title: Optimizer step and EMA
    body: >-
      AdamW updates two parameter groups: the head at 5 × 10<sup>-5</sup> and the vision encoder at 2.5 × 10<sup>-5</sup>,
      half the paper's rates. The rate warms up over 2,000 updates and then follows a cosine to zero. An exponential
      moving average of the weights is kept, and the averaged copy is what runs on the arm.
    formulas:
      - '\eta(u) = \eta_0 \begin{cases} u / 2000 & u < 2000 \\[4pt] \tfrac{1}{2}\big(1 + \cos(\pi p)\big) & \text{otherwise} \end{cases}'
      - '\bar\theta \leftarrow 0.999\,\bar\theta + 0.001\,\theta'
    where: >-
      Betas (0.9, 0.95), weight decay 10<sup>-4</sup>, gradient clipping at 1.0. *p* is the fraction of the decay done.
    detail: |-
      At the paper's 10<sup>-4</sup> and 5 × 10<sup>-5</sup> without warm-up, the MeanFlow error spiked until the learning
      rate had decayed. Halving both and adding a warm-up made training stable.

      The held-out loss of the real run was lowest at 8,000 updates (16k micro-batches) and rose slightly after that, so late
      in training the model fits the 147 training episodes more closely than it generalizes. The final EMA weights are on the
      rollout computer; a checkpoint nearer the minimum is kept on the training server.
    bounds: [1076, 520, 518, 398]
results:
  measured: true
  summary: >-
    Measured in simulation only. On the MuJoCo stack-bowls task with one fixed order, DEM stacked all three bowls in 5 of
    20 held-out layouts; grasping, carrying and nesting work, and every failure picked the top bowl first. The real-arm
    runs (real data only, and real data with history, view masking and augmentation) are trained but not yet rolled out.
  metrics:
    - name: Sim success, single order
      value: 25 % (5/20)
      method: "MuJoCo, order red, blue, black, 20 held-out layouts, EMA weights after 50k steps on 500 scripted episodes; 95 % CI 11–47 %."
    - name: Picked the top bowl first
      value: 90 %
      method: Same 20 episodes. The first pick follows the black bowl across all three slots, so it is not a position shortcut.
    - name: Sim success, six orders
      value: 0/10
      method: "The paper's recipe on 1,000 episodes covering all six orders: the head ignored the instruction."
    - name: Real-arm success
      method: 10 trials per checkpoint on the real arm, order red, blue, black, under the stack-bowls rollout protocol.
  protocol:
    - "Simulation: `lerobot-nexarm-eval` on seeds 1,000,000–1,000,019 (never used for training), 900 steps at most, `--env.stack_order=red,blue,black`."
    - "Real arm: the three bowls on the slots the simulation uses, all three cameras at 20 fps, the synchronous rollout engine."
    - A real trial ends at success (all three stacked in order), at a collision, or after 90 seconds.
links:
  - label: lerobot-nexarm
    url: https://github.com/khanhthanhdev/lerobot-nexarm
    note: robot, simulation, the DEM plugin and the experiments
  - label: DEM plugin README
    url: https://github.com/khanhthanhdev/lerobot-nexarm/tree/main/policies/lerobot_policy_dem
    note: install, training recipe and every change from the paper
  - label: Decoupled Embodiment Model
    url: https://github.com/Apollo-Lab-Yale/decoupled-embodiment-model
    note: the paper's code, pinned by commit
---

## Architecture

DEM is built from three networks that never see each other's weights. A **vision encoder** (DINOv3 ConvNeXt-B) turns each camera view into 256 tokens. A **language encoder** (NeoBERT, frozen) turns the instruction into 32 tokens. A **MeanFlow action head** reads both through cross-attention and maps Gaussian noise to a 16-step action chunk in one forward pass.

The head is where DEM differs from the other policies here. ACT and TurboVLA regress one chunk per observation; DEM samples one from a learned distribution, as a diffusion policy would, but in a single step instead of dozens. That keeps it as fast as a regressor: 22 ms per chunk with three cameras on the rollout computer's RTX 5050.

| Part             | Setting in lerobot-nexarm                                                       |
| ---------------- | ------------------------------------------------------------------------------- |
| Vision           | DINOv3 ConvNeXt-B, 256 × 256, stage-3 tokens (16 × 16 × 512 per view), trained  |
| Language         | NeoBERT, frozen, 32 tokens × 768                                                |
| Context          | 768 image + 32 language + 1 state token = 801, width 768, modality embeddings   |
| Head             | 8 × (AdaLN self-attention block + gated cross-attention), d 768, 12 heads, 107M |
| Global condition | 4 attention-pooled language queries + state → AdaLN (NexArm addition)           |
| Sampling         | MeanFlow, 1 step, fresh noise per chunk (`fixed` and `zero` optional)           |
| Chunk / executed | 16 / 8 actions at 20 Hz                                                         |
| Inference        | 22 ms and 1.8 GB per chunk, three cameras, RTX 5050                             |

## Changes from the paper

The paper's trained weights are not public, so every NexArm run starts from the public DINOv3 and NeoBERT checkpoints. A first run with the paper's recipe on all six stacking orders failed in sim (0/10): the head ignored both the instruction and the state, and its MeanFlow error spiked up to 12,554 until the learning rate had decayed. The plugin changes two things and keeps the rest:

| Change                | Why                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Global conditioning   | The instruction and the state also enter every head block through AdaLN, so hundreds of image tokens cannot drown them out. Starts at zero.   |
| Halved learning rates | 5e-5 head and 2.5e-5 vision with 2,000 warm-up updates, instead of 1e-4 and 5e-5 without warm-up, which made the MeanFlow error unstable.     |
| Action history        | Optional (TEMPO-ACT): the mean action of each of the last 10 s, as context tokens and through AdaLN, so the head knows the phase of the task. |
| View masking          | Optional: each listed camera hidden in 30 % of training samples, so the policy still acts when the arm blocks a view.                         |
| Smoother rollouts     | Optional at inference: one fixed noise per episode, or ACT-style temporal ensembling over a chunk predicted every step.                       |

## Training

| Setting   | Real-arm run (`261117-dem-stack-bowls-real`)                              |
| --------- | ------------------------------------------------------------------------- |
| Data      | 164 real episodes at 20 fps, idle starts trimmed; 147 train, 17 held out  |
| Cameras   | front, wrist, top (768 image tokens)                                      |
| Batch     | 16 × 2 accumulated = 32, 20,000 updates                                   |
| Optimizer | AdamW, lr 5e-5 head / 2.5e-5 vision, betas (0.9, 0.95), wd 1e-4, clip 1.0 |
| Schedule  | 2,000 warm-up updates, cosine to 0                                        |
| Loss      | adaptive-weighted MeanFlow + 0.25 dispersive; `ratio_r_eq_t` 0.5          |
| Precision | vision under bf16 autocast; head, JVP and loss in fp32                    |
| Weights   | EMA 0.999, evaluated as `pretrained_model_ema`                            |
| Cost      | 14.7 GB, 0.37 s per micro-batch on an RTX A5000                           |

<div class="rp-callout" markdown="1">
**Watch `meanflow_mse`, not the loss.** The dispersive term is a log-mean-exp and can only lower the total, and the adaptive weight divides out large errors, so a healthy-looking loss can hide a diverging head. On a checkpoint, also check that the chunk changes when the instruction or the state does: with the paper's head it changed by 0.3 ticks across six prompts, against 25 between two noise draws.
</div>
