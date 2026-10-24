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
    formulas:
      - '\hat{A}_t = \pi_\theta\big(I_t^{1..V},\ s_t,\ z = 0\big) \in \mathbb{R}^{100 \times 6}'
    where: >-
      *V* camera frames and the six-number joint state go in; *z* is the CVAE style latent, fixed to zero at inference.
      The output is 100 rows of five joint targets and a gripper target, in normalized units.
    shapes: "images V × 3×480×640 · state 6 → chunk 100 × 6"
    detail: |-
      Why predict a chunk at all? A policy that outputs one action per step makes a small error at every step, and each
      error changes the next observation into something the demonstrations never showed. Over a long task the drift
      compounds. Predicting 100 steps at once cuts the number of decisions per episode by a factor of 100, so there are far
      fewer chances to step off the demonstrated distribution. The ACT paper also points to pauses in human teleoperation:
      a one-step policy struggles to decide when a pause should end, while a chunk can represent the whole
      pause-then-move motion at once.

      The price is reaction time. Nothing the cameras see during those 3.33 seconds changes what the arm does. That is
      acceptable for stacking bowls in a static scene, but a bowl that slips mid-chunk is noticed only at the next cycle.
      The paper softens this with temporal ensembling (see the last step); lerobot-nexarm leaves it off, as LeRobot does by
      default.
    stage:
      shot: hero
      cams: true
      chunk: true
  - id: observe
    title: Observe
    body: >-
      The front Logitech, the wrist camera and, on the 3-camera dataset, the top RealSense each deliver one RGB frame at
      480 × 640. The five arm joints plus the gripper give a six-number state. State and actions are standardized with
      the dataset's mean and standard deviation; images use ImageNet statistics for the backbone.
    formulas:
      - '\tilde{s} = (s - \mu_s) \oslash \sigma_s'
      - '\tilde{I} = (I - \mu_{\text{IN}}) \oslash \sigma_{\text{IN}}'
    where: >-
      μ<sub>s</sub>, σ<sub>s</sub> are per-joint statistics computed over the training dataset; ⊘ is element-wise
      division.
    shapes: "observation.images.{front,wrist,top} 3×480×640 · observation.state 6"
    detail: |-
      Standardizing matters because the five joints and the gripper share one output layer and one loss. Without it, the
      joint with the largest range would dominate the L1 error. After dividing by each joint's standard deviation, an error
      of one unit means "one typical spread of that joint" for every joint. The same statistics are stored in the checkpoint
      and reused at rollout, so the policy always sees numbers on the scale it was trained on.

      The frames are not resized. The ResNet is fully convolutional up to the pooling layer that ACT removes, so a
      480 × 640 frame simply gives a larger feature map. There is no history either: the policy sees a single instant, one
      frame per camera and the state read at the same time.
    bounds: [16, 106, 518, 304]
    stage:
      shot: front
      cams: true
      frustums: true
  - id: backbone
    title: ResNet18 per image
    body: >-
      One ImageNet-initialized ResNet18 with frozen batch-norm statistics is shared by all cameras. Five stages of
      stride 2 leave a 512 × 15 × 20 feature map. A 1 × 1 convolution keeps 512 channels and the map is flattened into
      300 tokens per camera. A fixed 2D sine code records each cell's row and column: 256 channels for y, 256 for x.
    formulas:
      - 'F = \operatorname{ResNet18}(\tilde I) \in \mathbb{R}^{512 \times 15 \times 20}'
      - 'X_{\text{img}} = \operatorname{flatten}\big(\operatorname{Conv}_{1 \times 1}(F)\big) \in \mathbb{R}^{300 \times 512}'
      - 'p_{y,\,2i} = \sin\!\Big(\frac{2\pi\, y / H}{10000^{2i/256}}\Big),\quad p_{y,\,2i+1} = \cos\!\Big(\frac{2\pi\, y / H}{10000^{2i/256}}\Big)'
    where: >-
      *y* runs from 1 to *H* = 15 (and *x* from 1 to *W* = 20 in the same way); the y and x codes are concatenated into a
      512-wide position. The backbone trains at lr 10<sup>-5</sup>.
    shapes: "3×480×640 → 512×15×20 → 300 × 512 per camera"
    detail: |-
      "Frozen batch norm" means the running mean and variance learned on ImageNet are kept fixed. With a batch of only 2,
      statistics estimated from each batch would be too noisy to be useful. The convolution weights are still trained, at
      the same small rate as the rest of the network.

      ACT keeps the spatial map instead of pooling it into one vector, because *where* something is matters as much as
      *what* it is: the grasp depends on the bowl's position in the image, which a global average would throw away. The sine
      code gives every row and column a unique pattern of phases at many frequencies. It is the same for every camera; the
      cameras are told apart only by their place in the sequence and by what they show.

      These 300 tokens per camera are also why the encoder dominates the cost. Attention grows with the square of the
      sequence length, and three cameras give 902 tokens.
    bounds: [546, 106, 518, 304]
    stage:
      shot: top
      cams: true
      frustums: true
  - id: tokens
    title: Encoder input
    body: >-
      The latent and the joint state are each projected to 512 and get a learned position. They are placed in front of
      the image tokens of every camera to form one sequence. The positions are kept separate from the content: they are
      added to queries and keys inside attention, never to the values.
    formulas:
      - 'X = \big[\,W_z z ;\ W_s \tilde s ;\ X_{\text{img}}^{1} ; \dots ;\ X_{\text{img}}^{V}\,\big]'
      - 'P = \big[\,p_z ;\ p_s ;\ P_{\text{2D}}^{1} ; \dots ;\ P_{\text{2D}}^{V}\,\big]'
      - 'N = 2 + 300\,V = 902 \quad (V = 3)'
    where: >-
      *W*<sub>z</sub> is 32 → 512 and *W*<sub>s</sub> is 6 → 512; *p*<sub>z</sub>, *p*<sub>s</sub> are learned
      512-vectors.
    shapes: "X, P · 902 × 512 with 3 cameras"
    detail: |-
      Why add positions to the queries and keys but not the values? The position decides *who attends to whom*; the value
      is *what gets copied*. Keeping positions out of the values means the features carried from layer to layer are pure
      content, and the location is added again at every layer instead of being mixed in once and washed out. ACT inherits
      this from DETR, the object detector its transformer code is adapted from.

      The latent token is what lets one network represent several ways of doing the same task. During training it carries
      information about how the target chunk was actually performed: fast or slow, from the left or the right. At inference
      it is zero, the mean of the prior, which asks for the most typical way.
    bounds: [1076, 106, 518, 304]
    stage:
      shot: side
      joints: true
  - id: encoder
    title: Transformer encoder
    body: >-
      Four post-norm layers with 8 heads and a 3200-wide ReLU feed-forward let every token attend to every other, so a
      gripper pixel in the wrist view can be related to a bowl in the front view and to the current joint angles. The
      result is the memory the decoder reads.
    formulas:
      - 'X \leftarrow \operatorname{LN}\Big(X + \operatorname{MHA}\big(q = X + P,\ k = X + P,\ v = X\big)\Big)'
      - 'X \leftarrow \operatorname{LN}\big(X + W_2\,\operatorname{ReLU}(W_1 X)\big)'
      - '\operatorname{MHA}(q, k, v) = \big[\operatorname{softmax}\big(q W_q^{h} (k W_k^{h})^{\top} / \sqrt{64}\big)\, v W_v^{h}\big]_{h=1}^{8} W_o'
    where: >-
      *W*<sub>1</sub> is 512 → 3200, *W*<sub>2</sub> is 3200 → 512; 8 heads of width 64; dropout 0.1. After 4 layers,
      *M* = *X*.
    shapes: "902 × 512 → 4 × encoder layer → memory M 902 × 512"
    detail: |-
      Post-norm places the LayerNorm after the residual sum, as in the original Transformer and in DETR. TurboVLA's decoder
      uses the now more common pre-norm arrangement instead. With only four layers and a small learning rate, post-norm
      trains without trouble here.

      Each of the eight heads works in its own 64-dimensional subspace, so they can learn different relations at once. One
      head might match the gripper in the wrist view to the same gripper in the front view; another might relate a bowl's
      position to the state token. The cost is quadratic: 902 tokens give 902² ≈ 814,000 attention scores per head and per
      layer.
    bounds: [16, 426, 518, 304]
    stage:
      shot: side
      joints: true
  - id: decoder
    title: Decoder and action head
    body: >-
      The decoder input is 100 zero vectors; only their learned positions tell the slots apart, one for each future
      step. A single post-norm layer runs self-attention among the slots, cross-attention into the encoder memory and a
      feed-forward block. A final LayerNorm and a linear layer map each slot to six numbers.
    formulas:
      - 'x^{(0)} = 0 \in \mathbb{R}^{100 \times 512}'
      - 'x \leftarrow \operatorname{LN}\big(x + \operatorname{MHA}(x + p_{\text{dec}},\ x + p_{\text{dec}},\ x)\big)'
      - 'x \leftarrow \operatorname{LN}\big(x + \operatorname{MHA}(x + p_{\text{dec}},\ M + P,\ M)\big)'
      - 'x \leftarrow \operatorname{LN}\big(x + \operatorname{FFN}(x)\big),\quad \hat a = W_a \operatorname{LN}(x)'
    where: >-
      *p*<sub>dec</sub> is a learned 100 × 512 table; *W*<sub>a</sub> is 512 → 6.
    shapes: "100 queries × 512 → Linear 512→6 → chunk 100 × 6"
    detail: |-
      All 100 queries start as the same zero vector, so the first self-attention can tell them apart only through their
      learned positions. Query 1 learns to ask for the next action, query 100 for the action 3.3 seconds ahead.
      Cross-attention is where the actions read the scene: each query weighs all 902 memory tokens and takes what it needs.

      There is a single decoder layer. The paper lists 7, but its released code used only the output of the first one.
      LeRobot reproduces that behaviour with `n_decoder_layers = 1`, so the trained model matches the one behind the paper's
      results. All 100 actions come out of one forward pass, in parallel, not one after another as in a language model.
    bounds: [546, 426, 518, 304]
    stage:
      shot: chunk
      chunk: true
  - id: execute
    title: Execute the whole chunk
    body: >-
      lerobot-nexarm keeps ACT's default `n_action_steps = 100` with no temporal ensembling: the arm follows all 100
      targets open loop, one every 33 ms, then captures new frames. In the 3D view the dots ahead of the gripper are the
      part of the current chunk still to run; when they run out, the next cycle starts.
    formulas:
      - 'a_k = \sigma_a \odot \hat a_k + \mu_a,\quad k = 1, \dots, 100'
      - '\Delta t_{\text{replan}} = 100 \times \tfrac{1}{30}\,\text{s} \approx 3.33\,\text{s}'
      - 'a_t = \frac{\sum_i w_i\, \hat a_t^{(i)}}{\sum_i w_i},\quad w_i = e^{-m\, i}\qquad \text{(paper only)}'
    shapes: "100 actions × 33 ms = 3.33 s between observations"
    detail: |-
      The 100 targets are de-normalized with the training set's action statistics and sent as joint-position commands. The
      motors' own position controllers track each target until the next one arrives 33 ms later.

      The ACT paper instead runs the policy at every step and averages all the chunks that predict the current step (the third formula above). Index *i* = 0 is the oldest of those chunks, so with *m* > 0 older predictions weigh more, and *m* sets how quickly new observations are let in. This temporal ensembling gives
      smoother and more reactive motion, but costs 100 forward passes where lerobot-nexarm needs one. A middle ground is to
      set `n_action_steps` below 100, which re-plans more often without averaging.
    bounds: [1076, 426, 518, 304]
    stage:
      shot: hero
      chunk: true
      joints: true
training_steps:
  - id: overview
    title: One training step
    body: >-
      ACT is trained as a conditional VAE. Besides the policy, a second transformer reads the **true** action chunk and
      summarizes it as a latent *z*. The policy learns to reconstruct the chunk from the images, the state and *z*, and
      a KL term keeps *z* close to a unit Gaussian so it can be set to zero at inference.
    formulas:
      - '\min_{\theta, \phi}\ \mathbb{E}\Big[\,\lVert \pi_\theta(o, z) - A \rVert_1 + \beta\, D_{\mathrm{KL}}\big(q_\phi(z \mid s, A)\ \Vert\ \mathcal{N}(0, I)\big)\Big]'
    where: >-
      *q*<sub>φ</sub> is the CVAE encoder, *z* ∼ *q*<sub>φ</sub>, *o* the observation, *A* the recorded 100-step chunk
      and β = 10.
    detail: |-
      Why a CVAE? Human demonstrations are not consistent: the same scene can be followed by a quick reach or a slow one, a
      grasp from the left or from the right. A plain regressor trained on such data learns something in between, which may
      not be a valid motion at all. The latent *z* gives the network a place to put the part of the target that the
      observation alone cannot explain.

      The KL term with β = 10 limits how much information *z* can carry. If it could carry everything, the policy would copy
      the answer from *z* and ignore the cameras; with the penalty, the network still has to get most of the chunk from the
      images and the state.
  - id: t-data
    title: Sample a batch
    body: >-
      Samples come from the real teleoperated recordings. Each one is an observation at time *t* and the 100 actions that
      followed, with a pad flag for steps past the end of the episode. The batch is only 2 to fit an 8 GB GPU, so 8
      batches are accumulated before each optimizer step.
    formulas:
      - 'B_{\text{eff}} = 2 \times 8 = 16'
      - '\tilde a_k = (a_k - \mu_a) \oslash \sigma_a,\quad m_k = 1 - \text{is\_pad}_k'
    where: >-
      The last 10 % of episodes of each task are held out for the validation loss.
    shapes: "images 2 × V × 3 × 480 × 640 · state 2 × 6 · actions 2 × 100 × 6"
    detail: |-
      Gradient accumulation sums the gradients of 8 small batches before one update. Because the loss is a mean, this gives
      the same update as one batch of 16; the usual difference, batch-norm statistics, does not apply because they are
      frozen.

      The pad mask matters near the end of an episode. An observation 20 steps before the end has only 20 real future
      actions; the other 80 are copies of the last frame. With *m*<sub>k</sub> = 0 they are left out of the loss, so the
      model is not taught that the arm freezes at the end of every chunk.
    bounds: [16, 106, 518, 398]
  - id: t-cvae
    title: CVAE encoder
    body: >-
      A four-layer transformer, the same width as the main encoder, reads a [CLS] token, the projected state and the 100
      projected ground-truth actions, with a fixed 1D sine position code and a key-padding mask over padded actions. A
      linear layer on the [CLS] output gives the mean and log-variance of *z*.
    formulas:
      - 'h = \operatorname{Enc}_\phi\big([\,\text{CLS} ;\ W_s \tilde s ;\ W_a \tilde a_{1..100}\,] + p_{\text{1D}}\big)'
      - '[\,\mu ;\ \log\sigma^2\,] = W_{\text{lat}}\, h_{\text{CLS}} \in \mathbb{R}^{64}'
    where: >-
      102 tokens of width 512; *W*<sub>lat</sub> is 512 → 64, split into two 32-vectors.
    detail: |-
      The CVAE encoder exists only for training. It reads the answer, the true 100 actions, which is exactly why it cannot
      run at inference. Its [CLS] token is an extra input whose output summarizes the whole sequence, as in BERT.

      It reads the joint state but not the images. The latent therefore describes the motion relative to where the arm is,
      not what the cameras show; the images reach the policy only through the main encoder.
    bounds: [546, 106, 518, 398]
  - id: t-sample
    title: Reparameterize
    body: >-
      The latent is sampled with the reparameterization trick so the gradient can flow back into μ and σ. At inference
      the encoder is not run and *z* is set to the prior's mean, zero.
    formulas:
      - 'z = \mu + \sigma \odot \varepsilon,\quad \varepsilon \sim \mathcal{N}(0, I),\quad \sigma = \exp\big(\tfrac{1}{2}\log\sigma^2\big)'
      - 'z_{\text{inference}} = 0'
    detail: |-
      Drawing *z* as μ + σ·ε rather than directly from 𝒩(μ, σ²) moves the randomness into ε, which does not depend on any
      weight. Backpropagation can then pass through μ and σ to the CVAE encoder. The network predicts log σ² rather than σ
      so that its output is unconstrained while σ stays positive.
    bounds: [1076, 106, 518, 398]
  - id: t-policy
    title: Policy forward pass
    body: >-
      *z* becomes the first token of the main encoder, exactly where the zero latent sits at inference. The rest of the
      network is the one in the Inference tab: ResNet18 tokens, four encoder layers and the one-layer decoder.
    formulas:
      - '\hat A = \pi_\theta(\tilde I, \tilde s, z) \in \mathbb{R}^{100 \times 6}'
    detail: |-
      Training and inference use the same policy network; only the source of *z* differs. Because the KL term pulls every
      posterior towards 𝒩(0, I), the value 0 is a typical latent, not an input the network has never seen.
    bounds: [16, 520, 518, 398]
  - id: t-loss
    title: L1 + KL loss
    body: >-
      The reconstruction term is the absolute error over valid chunk steps, averaged per element. The KL term between
      the encoder's Gaussian and the unit Gaussian is summed over the 32 latent dimensions, averaged over the batch and
      weighted by 10.
    formulas:
      - '\mathcal{L}_{\text{L1}} = \frac{\sum_{k, j} m_k \lvert \hat a_{kj} - \tilde a_{kj} \rvert}{6 \sum_k m_k}'
      - 'D_{\mathrm{KL}} = -\tfrac{1}{2} \sum_{d=1}^{32} \big(1 + \log\sigma_d^2 - \mu_d^2 - \sigma_d^2\big)'
      - '\mathcal{L} = \mathcal{L}_{\text{L1}} + 10\, D_{\mathrm{KL}}'
    detail: |-
      ACT uses L1 rather than the more common squared error; the paper reports that it gives more precise action sequences.
      Squared error punishes large errors much harder than small ones, so a few outlier frames can dominate it, while L1
      weighs every unit of error the same.

      The KL divergence between two Gaussians has a closed form, so it needs no sampling.
    bounds: [546, 520, 518, 398]
  - id: t-update
    title: Optimizer step
    body: >-
      After 8 accumulated batches the gradients are clipped to a global norm of 10 and AdamW updates every weight,
      including the backbone, at a constant learning rate. There is no warm-up, no schedule and no weight averaging.
      Every 5,000 steps a checkpoint is saved and the held-out loss is computed.
    formulas:
      - 'g = \frac{1}{8} \sum_{b=1}^{8} \nabla_\theta \mathcal{L}_b,\quad g \leftarrow g \cdot \min\!\big(1,\ 10 / \lVert g \rVert_2\big)'
      - '\theta \leftarrow \operatorname{AdamW}(\theta, g;\ \eta = 10^{-5},\ \lambda = 10^{-4})'
    where: >-
      100,000 optimizer steps in total.
    detail: |-
      The learning rate, 10<sup>-5</sup>, is small and the same for the pretrained backbone and the freshly initialized
      transformer. Clipping at a norm of 10 acts only on rare spikes. With an effective batch of 16 and 100,000 updates,
      training sees about 1.6 million samples, many passes over the 163 episodes of `thanhkt/nexarm_stack_bowls`.
    bounds: [1076, 520, 518, 398]
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

The network has two halves. The **encoder** turns everything the robot knows at this instant into one sequence of 902 tokens: 300 image tokens from each camera, one for the joint state and one for the style latent. Four self-attention layers let all of them exchange information. The **decoder** holds 100 slots, one per future step, which read that sequence through cross-attention and each return one action. Nothing in the decoder is autoregressive: the 100 actions are produced together, so the whole chunk costs a single forward pass.

A second, training-only transformer, the **CVAE encoder**, compresses each demonstrated chunk into the 32-number latent. It is what lets one deterministic network learn from demonstrations that do the same task in different ways. It is discarded after training.

| Part             | Setting in lerobot-nexarm                                         |
| ---------------- | ----------------------------------------------------------------- |
| Vision backbone  | ResNet18, ImageNet-1k weights, shared across cameras              |
| Image tokens     | 1×1 conv to 512, 2D sine position embedding, 300 per 480×640 view |
| Encoder          | 4 layers, d_model 512, 8 heads, FFN 3200, ReLU, post-norm         |
| Decoder          | 1 layer, 100 learned queries (paper: 7, but its code used only 1) |
| Action head      | Linear 512 → 6                                                    |
| Latent           | 32-dimensional CVAE latent, KL weight 10                          |
| Normalization    | mean / std for state and actions, ImageNet stats for images       |
| Chunk / executed | 100 / 100 actions, no temporal ensembling (paper: ensembling on)  |

## Training

The model is trained as a conditional VAE. A second, smaller transformer reads the current joint state and the true next 100 actions and compresses them into a 32-dimensional latent _z_. That latent becomes the first token of the main encoder, so the network can tell apart demonstrations that look the same but were performed differently. The KL term keeps _z_ close to a unit Gaussian, which is why it can be replaced by zeros at inference.

The loss has two parts. The L1 term compares every predicted joint target with the recorded one, ignoring steps that run past the end of an episode. The KL term, weighted by 10, keeps the latent from carrying the whole answer. If it carried everything, the policy could ignore the cameras during training and would be lost at inference when the latent is zero.

The settings below are LeRobot's ACT defaults, apart from the batch size, which is reduced to fit an 8 GB GPU and compensated with gradient accumulation. A held-out L1 is logged every 5,000 steps. It shows whether the model still improves on unseen episodes, but not whether the arm will stack the bowls; that needs the evaluation in the Results tab.

| Setting         | Value                                                                  |
| --------------- | ---------------------------------------------------------------------- |
| Data            | Real teleoperated demonstrations, `thanhkt/nexarm_stack_bowls`         |
| Held-out split  | last 10% of episodes per task                                          |
| Effective batch | 16 (batch 2 × 8 gradient-accumulation steps, sized for an 8 GB GPU)    |
| Optimizer       | AdamW, lr 1e-5 for the transformer and the backbone, weight decay 1e-4 |
| Stability       | gradient clipping at 10, constant learning rate                        |
| Steps           | 100,000, checkpoint and held-out loss every 5,000                      |
| Loss            | L1 on actions, masked past the episode end, + 10 · KL                  |

<div class="rp-callout" markdown="1">
**Camera sets must match.** The default dataset has front and wrist cameras only; a 3-camera recording adds the top view. A policy trained on two cameras needs `--no-top-cam` at rollout, and `rollout.py` stops if the checkpoint and the robot disagree.
</div>
