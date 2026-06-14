---
layout: post
title: "Linear Regression & Normal Equation"
date: 2026-06-06 12:00:00
description: "Interactive visualization and derivation comparing the Normal Equation and Gradient Descent for Linear Regression."
tags: [machine-learning, optimization, tutorials, interactive]
categories: [explanation]
enable_math: true
chart:
  chartjs: true
css:
  - /assets/css/posts/gradient-descent.css
js:
  - /assets/js/posts/gradient-descent.js
---

In machine learning, **Linear Regression** is one of the most fundamental supervised learning algorithms. It models the relationship between features and continuous target variables using a linear equation.

Following the formulation from the classic article on **[Machine Learning Cơ Bản](https://machinelearningcoban.com/2016/12/28/linearregression/)**, we will explore how we can optimize this model using two completely different paradigms:

1.  **The Analytical Closed-form Solution (The Normal Equation)**
2.  **The Iterative Numerical Solution (Gradient Descent)**

---

### The Mathematical Formulation

Let our dataset consist of $N$ training examples: $\{(\mathbf{x}_i, y_i)\}_{i=1}^N$, where $\mathbf{x}_i$ is the input vector and $y_i$ is the target value.

For simple linear regression (1D feature), we express the model output as:

<!-- prettier-ignore -->
$$ y_i \approx f(\mathbf{x}_i) = w_1 x_i + w_0 $$

To simplify calculations, we define the parameter vector $\mathbf{w} = [w_1, w_0]^T$ and augment the input feature vector with a bias coordinate $1$, forming $\mathbf{\bar{x}}_i = [x_i, 1]^T$. The prediction becomes:

<!-- prettier-ignore -->
$$ f(\mathbf{\bar{x}}_i) = \mathbf{\bar{x}}_i^T \mathbf{w} $$

We can group all training inputs into a single **design matrix** $\mathbf{\bar{X}}$ of shape $N \times 2$, and all target labels into a column vector $\mathbf{y}$ of shape $N \times 1$:

<!-- prettier-ignore -->
$$ \mathbf{\bar{X}} = \begin{bmatrix} \mathbf{\bar{x}}_1^T \\ \mathbf{\bar{x}}_2^T \\ \vdots \\ \mathbf{\bar{x}}_N^T \end{bmatrix} = \begin{bmatrix} x_1 & 1 \\ x_2 & 1 \\ \vdots & \vdots \\ x_N & 1 \end{bmatrix}, \quad \mathbf{y} = \begin{bmatrix} y_1 \\ y_2 \\ \vdots \\ y_N \end{bmatrix} $$

Our predictions vector is $\mathbf{\hat{y}} = \mathbf{\bar{X}}\mathbf{w}$. The difference between predictions and targets is the error vector: $\mathbf{e} = \mathbf{\bar{X}}\mathbf{w} - \mathbf{y}$.

---

### The Loss Function (MSE)

Our optimization metric is the sum of squared errors, represented as the **Mean Squared Error (MSE)** loss:

<!-- prettier-ignore -->
$$ \mathcal{L}(\mathbf{w}) = \frac{1}{2N} \sum_{i=1}^{N} \left( \mathbf{\bar{x}}_i^T \mathbf{w} - y_i \right)^2 = \frac{1}{2N} \|\mathbf{\bar{X}}\mathbf{w} - \mathbf{y}\|_2^2 $$

We can expand this vector norm:

<!-- prettier-ignore -->
$$ \mathcal{L}(\mathbf{w}) = \frac{1}{2N} \left( \mathbf{w}^T \mathbf{\bar{X}}^T \mathbf{\bar{X}} \mathbf{w} - 2\mathbf{w}^T \mathbf{\bar{X}}^T \mathbf{y} + \mathbf{y}^T \mathbf{y} \right) $$

---

### Solution 1: The Analytical Closed-form (Normal Equation)

To minimize the loss function $\mathcal{L}(\mathbf{w})$, we compute its gradient with respect to $\mathbf{w}$ and set it to zero:

<!-- prettier-ignore -->
$$ \frac{\partial \mathcal{L}}{\partial \mathbf{w}} = \frac{1}{N} \mathbf{\bar{X}}^T (\mathbf{\bar{X}}\mathbf{w} - \mathbf{y}) = 0 $$

<!-- prettier-ignore -->
$$ \mathbf{\bar{X}}^T \mathbf{\bar{X}} \mathbf{w} = \mathbf{\bar{X}}^T \mathbf{y} $$

This is known as the **Normal Equation**. If the matrix $\mathbf{\bar{X}}^T \mathbf{\bar{X}}$ is invertible (non-singular), we obtain the analytical optimal solution $\mathbf{w}_{\text{opt}}$ in a single step:

<!-- prettier-ignore -->
$$ \mathbf{w}_{\text{opt}} = (\mathbf{\bar{X}}^T \mathbf{\bar{X}})^{-1} \mathbf{\bar{X}}^T \mathbf{y} $$

- **Pros**: No need to choose a learning rate ($\alpha$), no convergence thresholds or iterations. Finds the mathematically exact global minimum.
- **Cons**: Computing the inverse $(\mathbf{\bar{X}}^T \mathbf{\bar{X}})^{-1}$ takes $O(D^3)$ time, where $D$ is the number of features. For datasets with hundreds of thousands of features, it is extremely slow. Also, if features are collinear (redundant), the matrix is singular and cannot be inverted.

---

### Solution 2: The Iterative Numerical Approach (Gradient Descent)

For large datasets, we use **Gradient Descent**. Starting from an initial point (e.g. $\mathbf{w} = [0, 0]^T$), we update parameters iteratively:

<!-- prettier-ignore -->
$$ \mathbf{w} \leftarrow \mathbf{w} - \alpha \frac{\partial \mathcal{L}}{\partial \mathbf{w}} = \mathbf{w} - \frac{\alpha}{N} \mathbf{\bar{X}}^T (\mathbf{\bar{X}}\mathbf{w} - \mathbf{y}) $$

- **Pros**: Extremely efficient for massive datasets. Time complexity per step is $O(N D)$. Works even when the design matrix is not invertible.
- **Cons**: Requires careful tuning of hyperparameters ($\alpha$) and monitoring of convergence.

---

### Interactive Demonstration

Test these two optimization approaches below:

- **Click the canvas** to add data points (click near an existing point to delete it)
- **Run GD** to watch gradient descent iterate toward the minimum
- **Closed-form Fit** to instantly compute the Normal Equation solution

<div class="ml-playground">

  <!-- Controls -->
  <div class="playground-card">
    <h5>Configuration</h5>
    <div class="control-bar">
      <div class="control-group">
        <label for="select-preset">Dataset</label>
        <select id="select-preset" class="playground-select">
          <option value="noisy">Noisy Linear</option>
          <option value="clean">Clean Linear</option>
          <option value="outliers">With Outliers</option>
        </select>
      </div>
      <div class="control-group">
        <label for="slider-lr">Learning Rate ($\alpha$): <span id="val-lr">0.01</span></label>
        <input type="range" id="slider-lr" class="custom-slider" min="0.001" max="0.1" step="0.001" value="0.01">
      </div>
      <div class="control-group">
        <label for="slider-speed">Speed (FPS): <span id="val-speed">30</span></label>
        <input type="range" id="slider-speed" class="custom-slider" min="1" max="60" step="1" value="30">
      </div>
    </div>
    <div class="button-row">
      <button id="btn-run" class="playground-btn playground-btn-primary"><i class="fa-solid fa-play"></i> Run GD</button>
      <button id="btn-step" class="playground-btn playground-btn-secondary"><i class="fa-solid fa-forward-step"></i> Step</button>
      <button id="btn-closed-form" class="playground-btn playground-btn-secondary"><i class="fa-solid fa-bolt"></i> Closed-form Fit</button>
      <button id="btn-reset" class="playground-btn playground-btn-secondary"><i class="fa-solid fa-arrows-rotate"></i> Reset</button>
      <button id="btn-clear" class="playground-btn playground-btn-secondary"><i class="fa-solid fa-trash-can"></i> Clear</button>
    </div>
    <div class="metrics-row">
      <div class="metric-item"><span class="metric-label">Epoch</span><span id="metric-epoch" class="metric-value">0</span></div>
      <div class="metric-item"><span class="metric-label">Loss (MSE)</span><span id="metric-loss" class="metric-value">0.0000</span></div>
      <div class="metric-item"><span class="metric-label">w₁ (slope)</span><span id="metric-m" class="metric-value">0.000</span></div>
      <div class="metric-item"><span class="metric-label">w₀ (bias)</span><span id="metric-b" class="metric-value">0.000</span></div>
    </div>
  </div>

  <!-- Data & Regression Visualizer -->
  <div class="playground-card">
    <h5>Data & Regression Line</h5>
    <div class="canvas-wrapper">
      <canvas id="ml-canvas"></canvas>
      <div class="canvas-instruction">Click to add/remove points</div>
    </div>
    <div class="canvas-legend">
      <div class="legend-item"><span class="legend-swatch" style="background: var(--global-theme-color)"></span> Gradient Descent fit</div>
      <div class="legend-item"><span class="legend-swatch-dashed" style="border-color: #2196f3"></span> Closed-form optimal</div>
      <div class="legend-item"><span class="legend-swatch" style="background: rgba(0,0,0,0.12)"></span> Residuals</div>
    </div>
  </div>

  <!-- Analysis Charts -->
  <div class="charts-grid">

    <!-- Loss Contour -->
    <div class="chart-cell">
      <h6>Loss Surface & GD Path</h6>
      <div class="contour-wrapper">
        <canvas id="contour-canvas"></canvas>
      </div>
      <div class="canvas-legend" style="margin-top: 0.4rem">
        <div class="legend-item"><span class="legend-swatch" style="background: var(--global-theme-color)"></span> GD trajectory</div>
        <div class="legend-item"><span class="legend-swatch" style="background: #2196f3; border-radius: 50%; width: 10px; height: 10px"></span> Optimal w*</div>
      </div>
    </div>

    <!-- Loss History -->
    <div class="chart-cell">
      <h6>Loss (MSE) over Epochs</h6>
      <div class="chart-container"><canvas id="loss-chart"></canvas></div>
    </div>

    <!-- Weight Trajectory -->
    <div class="chart-cell">
      <h6>Weight Convergence</h6>
      <div class="chart-container"><canvas id="weight-chart"></canvas></div>
    </div>

    <!-- Gradient Magnitude -->
    <div class="chart-cell">
      <h6>Gradient Magnitude ‖∇L‖</h6>
      <div class="chart-container"><canvas id="grad-chart"></canvas></div>
    </div>

  </div>

</div>

---

### What the Charts Show

| Chart                      | What It Reveals                                                                                                                          |
| :------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **Data & Regression Line** | The model's current linear fit overlaid on the data. Watch the solid line converge onto the dashed optimal.                              |
| **Loss Surface & GD Path** | A heatmap of $\mathcal{L}(w_1, w_0)$ centered around the optimal point. The GD trajectory crawls downhill toward the minimum (blue dot). |
| **Loss over Epochs**       | The classic training curve. Should decrease monotonically if $\alpha$ is well-chosen.                                                    |
| **Weight Convergence**     | Tracks $w_1$ and $w_0$ independently over training iterations. Both should stabilize at the closed-form values.                          |
| **Gradient Magnitude**     | $\|\nabla \mathcal{L}\|$ shrinks toward zero as the model approaches the minimum — the hallmark of convergence.                          |

---

### Key Observations to Try

- **Learning rate too small** ($\alpha \approx 0.001$): Training is stable but very slow. The GD path on the loss surface takes tiny steps.
- **Learning rate too large** ($\alpha > 0.05$): The weights overshoot the minimum and oscillate. The gradient magnitude chart spikes instead of decaying.
- **Outlier sensitivity**: Load the _With Outliers_ preset. The optimal fit line gets pulled toward the outliers — a well-known weakness of MSE-based regression.

---

### Conclusion

Whether we compute weights analytically via matrix inversion in the **Normal Equation** or step slowly down the loss gradient with **Gradient Descent**, simple linear regression highlights the core principles of machine learning models.

By comparing the two approaches side-by-side and observing the loss surface, weight trajectories, and gradient dynamics, we build the mathematical and geometric intuitions needed for more advanced optimization algorithms in deep learning.
