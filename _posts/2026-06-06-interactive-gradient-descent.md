---
layout: post
title: "Linear Regression & Normal Equation"
date: 2026-06-06 12:00:00
description: "Interactive visualization and derivation comparing the Normal Equation and Gradient Descent for Linear Regression."
tags: [machine-learning, optimization, tutorials, interactive]
categories: [explanation]
enable_math: true
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

Watch a linear model train toward the closed-form least-squares solution.

<div class="ml-playground">

  <div class="playground-card">
    <div class="control-bar">
      <div class="control-group">
        <label for="slider-lr">Learning rate <span id="val-lr">0.005</span></label>
        <input type="range" id="slider-lr" class="custom-slider" min="0.001" max="0.05" step="0.001" value="0.005">
      </div>
      <div class="control-group">
        <label for="slider-noise">Training noise <span id="val-noise">0.60</span></label>
        <input type="range" id="slider-noise" class="custom-slider" min="0" max="1.5" step="0.05" value="0.60">
      </div>
    </div>

    <div class="button-row">
      <button id="btn-run" class="playground-btn playground-btn-primary"><i class="fa-solid fa-play"></i> Run</button>
      <button id="btn-step" class="playground-btn playground-btn-secondary"><i class="fa-solid fa-forward-step"></i> Step</button>
      <button id="btn-reset" class="playground-btn playground-btn-secondary"><i class="fa-solid fa-arrows-rotate"></i> Reset data</button>
    </div>

    <div class="metrics-row">
      <div class="metric-item"><span class="metric-label">Epoch</span><span id="metric-epoch" class="metric-value">0</span></div>
      <div class="metric-item"><span class="metric-label">Loss (MSE)</span><span id="metric-loss" class="metric-value">0.0000</span></div>
      <div class="metric-item"><span class="metric-label">w₁ (slope)</span><span id="metric-m" class="metric-value">0.000</span></div>
      <div class="metric-item"><span class="metric-label">w₀ (bias)</span><span id="metric-b" class="metric-value">0.000</span></div>
    </div>

    <div class="canvas-wrapper">
      <canvas id="ml-canvas"></canvas>
    </div>
    <div class="canvas-legend">
      <div class="legend-item"><span class="legend-swatch" style="background: var(--global-theme-color)"></span> Gradient Descent fit</div>
      <div class="legend-item"><span class="legend-swatch-dashed"></span> Closed-form fit</div>
      <div class="legend-item"><span class="legend-swatch" style="background: var(--global-divider-color)"></span> Residuals</div>
    </div>

  </div>

</div>

---

### What the Demo Shows

| Signal              | What It Reveals                                                                                              |
| :------------------ | :----------------------------------------------------------------------------------------------------------- |
| **Training points** | The generated dataset used for the current regression problem.                                               |
| **Solid line**      | The model learned by gradient descent at the current epoch.                                                  |
| **Dashed line**     | The exact least-squares solution computed directly from the same data.                                       |
| **Residuals**       | Each vertical error term. These shrink as the gradient descent line approaches the best possible linear fit. |

---

### Key Observations to Try

- **Learning rate too small** ($\alpha \approx 0.001$): Training is stable but slow.
- **Learning rate too large** ($\alpha \approx 0.05$): The weights can overshoot and the loss may diverge.
- **Noise sensitivity**: Increase noise and reset the data to see the fitted line move away from the clean trend.

---

### Conclusion

Whether we compute weights analytically via matrix inversion in the **Normal Equation** or step slowly down the loss gradient with **Gradient Descent**, simple linear regression highlights the core principles of machine learning models.

By comparing the two approaches side-by-side and observing the loss surface, weight trajectories, and gradient dynamics, we build the mathematical and geometric intuitions needed for more advanced optimization algorithms in deep learning.
