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
      TurboVLA reads the cameras, the joint state **and the task instruction**. DINOv3 encodes the images, a frozen BERT
      encodes the text, six interaction layers let each modality attend to the other, and a small decoder predicts 16
      future actions. Only the first 8 are run, about a quarter of a second, before the policy sees the scene again.
    formulas:
      - '\hat{A}_t = \pi_\theta\big(I_t^{1..V},\ \ell,\ s_t\big) \in [-1, 1]^{16 \times 6}'
    where: >-
      *V* camera views, the instruction ℓ and the six-number joint state go in; one forward pass gives 16 rows of five
      joint targets and a gripper target, still in normalized units.
    shapes: "images V × 3×224×224 · text L tokens · state 6 → chunk 16 × 6"
    detail: |-
      Most vision-language-action models send both the images and the instruction through a large language model and read
      the action out of it, a V → L → A path. The TurboVLA paper argues the LLM is not needed for the action. It encodes
      images and text separately, lets them exchange information directly, and decodes actions from the result, a
      V + L → A path.

      In the paper's LIBERO setup this gives about 0.2 B parameters, 31.2 ms per inference and 0.9 GiB of inference memory on
      an RTX 4090, with 97.6 % average success. Those are the paper's numbers, not NexArm measurements.

      Running 8 of the 16 actions is a compromise. The second half of a chunk is the part predicted furthest ahead from an
      old view, so it is discarded and replaced by a fresh prediction.
    stage:
      shot: hero
      cams: true
      chunk: true
  - id: observe
    title: Observe
    body: >-
      Every camera frame is resized to 224 × 224 by the DINOv3 image processor and normalized with ImageNet statistics.
      Views are ordered front, wrist, top; the top camera is used only when the dataset recorded it, and the order is
      saved in the checkpoint's config. The joint state is min-max scaled to [-1, 1] with ranges saved at training time.
    formulas:
      - '\tilde{s} = 2\,\frac{s - s_{\min}}{s_{\max} - s_{\min}} - 1'
      - '\tilde{I} = \big(\operatorname{resize}_{224}(I) - \mu_{\text{IN}}\big) \oslash \sigma_{\text{IN}}'
    where: >-
      *s*<sub>min</sub>, *s*<sub>max</sub> come from `stats_turbovla.json`; μ<sub>IN</sub>, σ<sub>IN</sub> are the
      per-channel ImageNet mean and standard deviation.
    shapes: "V = 2 or 3 views · state 6 in [-1, 1]"
    detail: |-
      Unlike ACT, every view is resized to 224 × 224, the resolution DINOv3 is used at. That fixes the token count at 196
      per view, whatever the camera's resolution.

      Min-max scaling to [-1, 1] is chosen to match the `tanh` at the output. Every action the network can produce lies
      inside the range seen in training, so the arm is never commanded past a recorded joint limit.
    bounds: [16, 106, 408, 304]
    stage:
      shot: front
      cams: true
      frustums: true
  - id: vision
    title: DINOv3 vision encoder
    body: >-
      Each view goes through DINOv3 ViT-B/16 on its own, in bf16. A 224-pixel image is 14 × 14 patches of 16 pixels; the
      class token and the four register tokens are dropped, so every view gives 196 tokens of width 768. A residual MLP
      projects them to 256 and a learned view embedding says which camera they came from. The backbone is fine-tuned.
    formulas:
      - 'x = \operatorname{DINOv3}(\tilde I)_{[5:]} \in \mathbb{R}^{196 \times 768}'
      - 'z = \operatorname{LN}\big(W_{\text{skip}}\,x + W_2\,\operatorname{GELU}(W_1 \operatorname{LN}(x))\big) + e_{\text{view}}'
      - 'N_v = V \cdot (224 / 16)^2 = 196\,V'
    where: >-
      *W*<sub>1</sub> is 768 → 1024 (dropout 0.1 after the GELU), *W*<sub>2</sub> is 1024 → 256 and
      *W*<sub>skip</sub> is 768 → 256 without bias. *e*<sub>view</sub> is one learned 256-vector per camera.
    shapes: "V × 196 × 768 → V × 196 × 256 → 588 × 256 with 3 views"
    detail: |-
      DINOv3 is trained without labels on a very large image collection, and its patch features are known to be good for
      dense tasks such as segmentation and depth. That is what a policy needs: where the bowls and the gripper are, not just
      what the picture is of. Unlike ACT's ResNet it is a transformer. Each 16 × 16 patch becomes a token, and attention
      inside the backbone already relates distant parts of one view.

      The four register tokens are extra tokens the model uses as scratch space for global information, which would
      otherwise leak into some patch tokens as artefacts. They and the class token are dropped, so only spatial tokens
      remain. The projection to 256 keeps everything downstream small: fusion and decoding run at width 256, half of ACT's
      512.
    bounds: [424, 106, 408, 304]
    stage:
      shot: top
      cams: true
      frustums: true
  - id: language
    title: BERT language encoder
    body: >-
      The instruction, for example "stack the bowls", is tokenized with WordPiece and encoded by BERT-base, which stays
      frozen in eval mode. A linear layer maps its 768-wide outputs to 256. The tokenizer's special tokens and
      punctuation split the text into sentences, and a block mask keeps each token's later self-attention inside its own
      sentence.
    formulas:
      - 'l = W_t\,\operatorname{BERT}(\ell) \in \mathbb{R}^{L \times 256}'
      - 'M_{ij} = \begin{cases} \text{attend} & i, j \text{ in the same sentence} \\ \text{masked} & \text{otherwise} \end{cases}'
    where: >-
      *W*<sub>t</sub> is 768 → 256 with Xavier initialization; sentences are delimited by [CLS], [SEP], "." and "?".
      Padding tokens are also removed from the image-to-text attention.
    shapes: "L × 768 → Linear → L × 256"
    detail: |-
      Freezing BERT keeps the language knowledge it learned from text and stops a small robot dataset from overwriting it.
      On the NexArm the stacking dataset uses a single task prompt, so the text acts mostly as a constant task code. It
      matters more when one checkpoint is trained on many instructions, as in the paper's LIBERO experiments.

      The sentence mask keeps the sentences of a longer instruction apart in the text-only layers, so "pick up the red bowl.
      put it in the blue one." is not blurred into one bag of words before it meets the image.
    bounds: [832, 106, 408, 304]
    stage:
      shot: hero
      cams: false
      chunk: false
  - id: interaction
    title: Vision ↔ language interaction
    body: >-
      Six layers fuse the two streams. A bi-attention block computes **one** matrix of attention logits between image
      and text tokens and uses it in both directions: softmax over the text for the image update, softmax over the
      images for the text update. Residuals start from the layer-normed input, and each update is scaled by a LayerScale
      γ that starts at 10<sup>-4</sup>, so a fresh layer is close to the identity. A text-only transformer layer then
      refines the text with the sentence mask.
    formulas:
      - '\bar v = \operatorname{LN}(v),\quad \bar l = \operatorname{LN}(l),\quad S = \frac{(W_q \bar v)(W_k \bar l)^{\top}}{\sqrt{d_h}}'
      - 'v \leftarrow \bar v + \operatorname{DropPath}\big(\gamma_v \odot W_o^{v}\,\operatorname{softmax}_{\text{text}}(S)\,W_{vl}\,\bar l\big)'
      - 'l \leftarrow \bar l + \operatorname{DropPath}\big(\gamma_l \odot W_o^{l}\,\operatorname{softmax}_{\text{img}}(S^{\top})\,W_{vv}\,\bar v\big)'
      - 'l \leftarrow \operatorname{TransformerLayer}(l;\ M)'
    where: >-
      4 heads with *d*<sub>h</sub> = 256 (inner width 1024), DropPath 0.1. The text layer is post-norm with 4 heads and
      a 1024-wide ReLU feed-forward. After layer 6 the streams are concatenated.
    shapes: "(588 + L) × 256 → 6 × interaction → (588 + L) × 256"
    detail: |-
      Sharing one logit matrix *S* keeps the two directions consistent: if image patch *i* finds text token *j* relevant,
      then *j* finds *i* relevant with the same score. Normalizing over the text answers "which words matter for this
      patch"; normalizing over the images answers "which patches does this word refer to".

      A LayerScale of 10<sup>-4</sup> at initialization means a fresh interaction layer barely changes the pretrained DINOv3
      and BERT features at first, so early training cannot wreck them. DropPath randomly drops a whole residual branch for a
      sample during training, a regularizer that is standard in vision transformers.

      Image tokens do not attend to each other in these layers, only to the text. The views are combined later, when the
      action queries attend to all of them at once.
    bounds: [1240, 106, 408, 304]
    stage:
      shot: side
      cams: true
  - id: state
    title: State tokens
    body: >-
      The normalized joint state does not take part in the interaction. A small MLP turns it into two 256-wide tokens,
      each with its own learned position, and they are appended to the image and text tokens to form the decoder's
      memory.
    formulas:
      - '[\,s^{(1)} ;\ s^{(2)}\,] = \operatorname{reshape}\big(W_b\,\operatorname{GELU}(W_a \operatorname{LN}(\tilde s))\big) + [\,p_1 ;\ p_2\,]'
      - 'm = \big[\,v ;\ l ;\ \operatorname{LN}(s^{(1)}) ;\ \operatorname{LN}(s^{(2)})\,\big]'
    where: >-
      *W*<sub>a</sub> is 6 → 256 (dropout 0.1 after the GELU), *W*<sub>b</sub> is 256 → 512, reshaped to 2 × 256.
    shapes: "6 → 2 × 256 · memory (588 + L + 2) × 256"
    detail: |-
      Keeping the state out of the fusion means the vision-language layers model the scene and the task; the arm's own
      configuration joins only where actions are decoded. With 588 + *L* image and text tokens in the memory, the two state
      tokens are a small but always-present part of what the queries can attend to.
    bounds: [16, 426, 408, 304]
    stage:
      shot: side
      joints: true
  - id: action
    title: ACT-style action head
    body: >-
      Sixteen learned queries, one per future step, pass through three pre-norm decoder layers (d 256, 8 heads,
      feed-forward 2048, dropout 0.1): self-attention among the queries, cross-attention into the memory, then a
      feed-forward block. A three-layer MLP maps each query to six numbers and `tanh` keeps them in [-1, 1]. There is no
      CVAE: the output is one deterministic chunk.
    formulas:
      - 'q \leftarrow q + \operatorname{SelfAttn}(\operatorname{LN}(q))'
      - 'q \leftarrow q + \operatorname{CrossAttn}(\operatorname{LN}(q),\ m)'
      - 'q \leftarrow q + \operatorname{FFN}(\operatorname{LN}(q))'
      - '\hat a = \tanh\big(\operatorname{MLP}_{256 \to 512 \to 512 \to 6}(q)\big)'
    where: >-
      The three updates repeat for each of the 3 layers. The MLP uses ReLU between its layers; there is no final
      LayerNorm after the last decoder layer.
    shapes: "16 queries × 256 → 3 decoder layers → MLP → tanh → 16 × 6"
    detail: |-
      Pre-norm puts the LayerNorm inside each residual branch and leaves the residual stream itself unnormalized, the
      arrangement most recent transformers use. Unlike ACT there is no latent *z*. TurboVLA regresses one chunk directly
      with L1, so if the demonstrations contain two different ways of doing something, it has no explicit mechanism to pick
      one. For a single task teleoperated consistently, this is usually acceptable.

      The 16 queries are learned vectors rather than zeros, and the three layers are all used, so the decoder is both
      deeper and narrower than ACT's single 512-wide layer.
    bounds: [424, 426, 408, 304]
    stage:
      shot: chunk
      chunk: true
      joints: true
  - id: execute
    title: Run 8, then infer again
    body: >-
      The min-max statistics turn the chunk back into joint and gripper targets. `rollout_turbovla.py` runs the first 8
      (`--open-loop-steps 8`) at 30 Hz and throws the other 8 away, then captures new frames and runs the whole network
      again. In the 3D view, the dots ahead of the gripper are the actions still to run before the next inference.
    formulas:
      - 'a = \tfrac{1}{2}(\hat a + 1)\,(a_{\max} - a_{\min}) + a_{\min}'
      - '\Delta t_{\text{replan}} = 8 \times \tfrac{1}{30}\,\text{s} \approx 0.27\,\text{s}'
    shapes: "8 × 33 ms = 0.27 s between observations"
    detail: |-
      Re-planning every 8 steps means the policy looks at the scene 3.75 times per second instead of once every 3.3 seconds
      as with ACT, so it can react to a bowl that moved. The cost is one network pass per 0.27 s of motion instead of per
      3.3 s. The paper's 31 ms latency was measured on an RTX 4090 in its LIBERO setup; on the computer driving the NexArm,
      and with three cameras, it should be measured again, because it adds directly to the time between observing and acting.
    bounds: [832, 426, 408, 304]
    stage:
      shot: hero
      chunk: true
      joints: true
training_steps:
  - id: overview
    title: One training step
    body: >-
      `train_turbovla.py` repeats this loop for 50,000 optimizer steps: draw a batch from simulation and real data,
      normalize it, predict a 16-step chunk, score it with a masked L1 loss, update the weights and fold them into a
      moving average. The average is what gets saved and run on the arm.
    formulas:
      - '\theta^{*} = \arg\min_\theta\ \mathbb{E}_{(o, A) \sim \mathcal{D}_{\text{mix}}}\ \mathcal{L}\big(\pi_\theta(o), A\big)'
    where: >-
      *o* is the observation (images, instruction, state), *A* the recorded 16-step action chunk, and
      𝒟<sub>mix</sub> the sim/real mixture.
    detail: |-
      Compared with ACT the loop is simpler: there is no CVAE and a single loss term. It also takes half the optimizer steps
      (50,000 instead of 100,000) with a real batch of 16 instead of accumulated batches of 2, and a learning rate five times
      higher. Most of the network's knowledge comes from the pretrained DINOv3 and BERT, so the policy layers on top have
      less to learn from scratch.
  - id: t-data
    title: Mix simulation and real data
    body: >-
      Scripted bowl-stacking demonstrations from the MuJoCo scene, with randomized lighting, colours and poses, are
      concatenated with the real teleoperated set. `DomainMixSampler` draws each sample from the real set with
      probability *r*, independently of how large each set is, so the smaller real set is not drowned out.
    formulas:
      - 'i \sim \begin{cases} \mathcal{U}(\mathcal{D}_{\text{real}}) & \text{with probability } r \\ \mathcal{U}(\mathcal{D}_{\text{sim}}) & \text{with probability } 1 - r \end{cases}'
    where: >-
      `--real-ratio 0.5` by default; `--no-sim` trains on the real set alone. Indices are drawn with replacement from a
      generator seeded the same on every GPU and then split by rank.
    shapes: "batch 16 per GPU · no gradient accumulation"
    detail: |-
      Real teleoperated demonstrations are slow to collect; the MuJoCo scene can generate many scripted episodes with varied
      lighting, colours and object poses. Domain randomization makes the simulated images vary more than the real ones, so
      the policy cannot rely on rendering details and has to use what the two domains share: the shapes and positions of the
      bowls and the arm.

      The real ratio is a trade-off. With too little real data the policy fits the renderer; with too much, the simulation
      adds little.
    bounds: [16, 106, 518, 398]
  - id: t-batch
    title: Collate and normalize
    body: >-
      The collator runs the DINOv3 image processor on every view, scales the state and the 16-step action chunk to
      [-1, 1], and keeps the `action_is_pad` flags for chunk steps that run past the end of an episode. The min-max
      ranges are merged across the two domains, so simulation and the real arm share one coordinate system.
    formulas:
      - '\tilde a_k = 2\,\frac{a_k - a_{\min}}{a_{\max} - a_{\min}} - 1,\quad k = 1, \dots, 16'
      - 'a_{\min} = \min\big(a_{\min}^{\text{sim}}, a_{\min}^{\text{real}}\big),\quad a_{\max} = \max\big(a_{\max}^{\text{sim}}, a_{\max}^{\text{real}}\big)'
      - 'm_k = 1 - \text{is\_pad}_k'
    shapes: "pixels B × V × 3 × 224 × 224 · state B × 6 · actions B × 16 × 6 · mask B × 16"
    detail: |-
      Merging the min-max ranges is what makes co-training work. If each domain were scaled with its own range, the same
      joint angle would map to different normalized values in simulation and on the real arm, and the network would have to
      learn two coordinate systems at once.

      The pad flags play the same role as in ACT: a chunk that starts near the end of an episode has fewer than 16 real
      actions, and the missing ones must not count as targets.
    bounds: [546, 106, 518, 398]
  - id: t-forward
    title: Forward pass
    body: >-
      The batch goes through the same network as in the Inference tab. BERT is frozen and receives no gradient; DINOv3,
      the projections, the interaction layers and the action head are all trained. With `--precision bf16` the forward
      pass runs under autocast.
    formulas:
      - '\hat A = \pi_\theta\big(I, \ell, \tilde s\big) \in [-1, 1]^{16 \times 6}'
      - '\theta = \theta_{\text{DINOv3}} \cup \theta_{\text{proj}} \cup \theta_{\text{interaction}} \cup \theta_{\text{head}}'
    shapes: "â · B × 16 × 6"
    detail: |-
      bf16 autocast stores activations in 16-bit floats and runs the matrix multiplications in that format, which roughly
      halves the activation memory and speeds up training on recent GPUs. The weights and the optimizer state stay in 32-bit.
      BERT receives no gradient, so its activations need not be kept for the backward pass, another memory saving.
    bounds: [1076, 106, 518, 398]
  - id: t-loss
    title: Masked L1 loss
    body: >-
      The absolute error is taken per chunk step and per joint. Padded steps are zeroed and the sum is divided by the
      number of valid entries, so a chunk cut short at the end of an episode is not penalized for steps that do not
      exist. `--gripper-loss-weight` scales the gripper column when the open/close timing matters more.
    formulas:
      - '\mathcal{L} = \frac{\sum_{k=1}^{16} \sum_{j=1}^{6} m_k\, w_j\, \lvert \hat a_{kj} - \tilde a_{kj} \rvert}{6 \sum_{k} m_k}'
      - 'w_j = 1 \ \text{for the five joints},\quad w_6 = w_{\text{grip}}'
    where: >-
      `--loss-type mse` or `smooth_l1` replace the absolute error with a squared or Huber error; the masking and the
      normalization stay the same.
    detail: |-
      Dividing by the number of valid entries, rather than by the full 16 × 6, keeps the loss on the same scale whether a
      chunk is complete or cut short.

      The gripper weight exists because the gripper column is where timing errors are most costly: closing a few steps early
      or late misses the grasp, while a joint error of the same size is just a small correction of the path.
    bounds: [16, 520, 518, 398]
  - id: t-update
    title: Optimizer step
    body: >-
      Gradients are clipped to a global norm of 1.0, then AdamW updates three parameter groups: the action head, the
      remaining trainable modules, and DINOv3, each at 5 × 10<sup>-5</sup>. The learning rate ramps up linearly over the
      first 1,000 steps and then follows a cosine down to 5 % of its base value at step 50,000.
    formulas:
      - 'g \leftarrow g \cdot \min\!\big(1,\ 1 / \lVert g \rVert_2\big)'
      - '\eta(u) = \eta_0 \begin{cases} \dfrac{u + 1}{1000} & u < 1000 \\[4pt] 0.05 + 0.95\,\dfrac{1 + \cos(\pi p)}{2} & \text{otherwise} \end{cases}'
      - 'p = \frac{u - 1000}{49\,000},\quad \eta_0 = 5 \times 10^{-5}'
    where: >-
      *u* counts optimizer updates. Weight decay is 10<sup>-10</sup>, effectively off.
    detail: |-
      The warm-up keeps the large and poorly aimed updates of the first steps from disturbing the pretrained DINOv3 weights.
      The cosine decay lets late training make small refinements. The paper keeps the rate constant after warm-up, so the
      decay is a choice of the NexArm script, not part of the method.
    bounds: [546, 520, 518, 398]
  - id: t-ema
    title: Moving average and checkpoint
    body: >-
      After every update the script folds the new weights into an exponential moving average. The average changes
      slowly, which smooths out the noise of individual batches. Every 5,000 steps it writes the EMA weights, the raw
      weights, `config.json` (cameras, image size, fps, task) and `stats_turbovla.json`; the rollout script loads the
      EMA weights.
    formulas:
      - '\bar\theta \leftarrow 0.999\,\bar\theta + 0.001\,\theta'
      - '\text{averaging window} \approx \frac{1}{1 - 0.999} = 1000 \text{ updates}'
    detail: |-
      EMA weights are usually a little better than the final raw weights, because they average over roughly the last
      thousand updates instead of reflecting whichever batch came last. The raw weights are saved too, so that training can
      be resumed exactly where it stopped.
    bounds: [1076, 520, 518, 398]
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

The pipeline has four parts:

1. **Encode.** DINOv3 turns each camera view into 196 patch tokens, and a frozen BERT turns the instruction into word tokens. Both are projected to width 256.
2. **Fuse.** Six bi-attention layers let image tokens read the text and text tokens read the images, through one shared attention matrix per layer.
3. **Add the state.** The joint state is turned into two tokens and appended to the fused sequence.
4. **Decode.** Sixteen learned queries read that memory through a three-layer decoder and become 16 actions.

The paper's argument is that skipping a large language model costs little accuracy and saves a great deal of compute: about 0.2 B parameters and 31 ms per step in its LIBERO configuration. On the NexArm the gain is mostly reaction time. A policy that is cheap to run can afford to re-plan every 8 steps instead of every 100.

| Part              | Setting used for the NexArm                                     |
| ----------------- | --------------------------------------------------------------- |
| Vision            | DINOv3 ViT-B/16, 224 × 224, views encoded separately, trainable |
| Vision projection | LN → MLP 768 → 1024 → 256 + linear skip, LN, + view embedding   |
| Language          | BERT-base uncased, frozen, Linear 768 → 256                     |
| Interaction       | 6 × (shared-logit bi-attention, 4 heads + text transformer)     |
| State             | LN → MLP 6 → 256 → 512 → 2 tokens + learned positions           |
| Action decoder    | 16 queries, 3 pre-norm layers, d 256, 8 heads, FFN 2048         |
| Output            | MLP 256 → 512 → 512 → 6, tanh, min-max to joint units           |
| Chunk / executed  | 16 / 8 actions                                                  |

## Training

The training script can mix two sources: scripted bowl-stacking demonstrations generated in the MuJoCo scene with domain randomization, and real teleoperated demonstrations. With `--real-ratio 0.5` a sampler draws each training sample from the real set with probability one half, so the smaller real set is not drowned out by simulation.

There is no CVAE. The model is a plain regressor trained with a masked L1 loss on actions scaled to [-1, 1]. BERT stays frozen; DINOv3 is fine-tuned together with everything else, at the same learning rate. An exponential moving average of the weights is kept throughout training, and that averaged copy is what gets saved and run on the arm.

The paper keeps the learning rate constant after warm-up. The NexArm script decays it with a cosine to 5 % over 50,000 steps. That is the one place where the table below departs from the paper.

| Setting        | Default in `train_turbovla.py`                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Data           | sim + real, or either alone (`--no-sim` for real only)                                             |
| Batch          | 16 per device, no accumulation                                                                     |
| Optimizer      | AdamW, lr 5e-5 for the head, interaction and DINOv3                                                |
| Schedule       | 1,000 warm-up steps, cosine to 5 %, 50,000 steps, save every 5,000 (paper: constant after warm-up) |
| Loss           | L1 over non-padded chunk steps, optional `--gripper-loss-weight`                                   |
| Stability      | gradient clipping at 1.0, EMA of weights with decay 0.999                                          |
| Starting point | from scratch, or the released RoboTwin checkpoint                                                  |

<div class="rp-callout" markdown="1">
**The checkpoint carries its own contract.** `config.json` stores the camera keys in order, the image size, the fps and the default task prompt, and `stats_turbovla.json` stores the min-max ranges. The rollout script reads both, so a checkpoint trained without the top camera is run without it.
</div>
