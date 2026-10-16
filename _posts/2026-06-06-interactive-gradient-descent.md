---
layout: post
title: "From a Decision Line to a Tiny Neural Network"
date: 2026-06-06 12:00:00
description: "A visual, interactive path through neurons, loss, gradient descent, backpropagation, mini-batches, and nonlinear classification."
tags: [machine-learning, neural-networks, gradient-descent, backpropagation, interactive]
categories: [explanation]
enable_math: true
tabs: true
css:
  - /assets/css/posts/gradient-descent.css
js:
  - /assets/js/posts/gradient-descent.js
---

How can a program learn to separate two kinds of fruit, then eventually recognize a
doodle? We will build the ideas one at a time. Every playground below is a real
calculation in vanilla JavaScript—not a prerecorded animation.

### Running the code examples

The examples use vectorized numerical libraries rather than an ML framework so the
operations remain visible. Python requires `numpy`, C++ requires Eigen 3, and Rust
requires `ndarray = "0.16"`. Snippets are cumulative within each language: keep the
imports and helper functions as you move down the article. In production, libraries
such as PyTorch, TensorFlow, LibTorch, and Burn perform these same tensor operations
and usually provide automatic differentiation. In the C++ and Rust tabs, place
executable statements inside `main`; helper functions and structs stay outside it.

## 1. Begin with a boundary

Imagine each fruit as a point: $$x_1$$ is redness and $$x_2$$ is roundness. Apples
and oranges have labels 1 and 0. A classifier needs a boundary in this feature
plane; points on opposite sides receive opposite predictions.

The first real ML operation is representing a batch as a feature matrix `X` and its
targets as a vector `y`. Rows are examples and columns are features.

{% tabs gd-data %}

{% tab gd-data Python %}

```python
import numpy as np

# Four fruit, two features per fruit: [redness, roundness].
X = np.array([
    [-0.75, -0.45],
    [-0.55, -0.75],
    [ 0.30,  0.55],
    [ 0.65,  0.35],
], dtype=np.float64)
y = np.array([0.0, 0.0, 1.0, 1.0])

assert X.shape == (4, 2) and y.shape == (4,)
```

{% endtab %}

{% tab gd-data C++ %}

```cpp
#include <Eigen/Dense>
#include <algorithm>
#include <cmath>
#include <iostream>
#include <numeric>
#include <random>
#include <vector>

using Eigen::MatrixXd;
using Eigen::VectorXd;

MatrixXd X(4, 2);
X << -0.75, -0.45,
     -0.55, -0.75,
      0.30,  0.55,
      0.65,  0.35;
VectorXd y(4);
y << 0.0, 0.0, 1.0, 1.0;
```

{% endtab %}

{% tab gd-data Rust %}

```rust
use ndarray::{array, Array1, Array2, Axis};

// Add ndarray = "0.16" under [dependencies] in Cargo.toml.
let x: Array2<f64> = array![
    [-0.75, -0.45],
    [-0.55, -0.75],
    [ 0.30,  0.55],
    [ 0.65,  0.35],
];
let y: Array1<f64> = array![0.0, 0.0, 1.0, 1.0];

assert_eq!(x.dim(), (4, 2));
```

{% endtab %}

{% endtabs %}

## 2. Weights and bias

A single neuron computes

$$z=w_1x_1+w_2x_2+b,\qquad \hat y=\begin{cases}1&z\ge0\\0&z<0.\end{cases}$$

Weights rotate the boundary and the bias shifts it. Try to separate the fruit. The
renderer handles vertical boundaries directly rather than dividing by $$w_2$$.

In code, `X @ w + b` computes every example's **logit** at once. Thresholding is
useful for inference; training keeps the continuous logits so gradients are not
destroyed by the step function.

{% tabs gd-linear %}

{% tab gd-linear Python %}

```python
def predict_linear(X: np.ndarray, w: np.ndarray, b: float) -> tuple[np.ndarray, np.ndarray]:
    logits = X @ w + b
    predictions = (logits >= 0.0).astype(np.int64)
    return logits, predictions

w = np.array([1.0, 1.0])
b = 0.0
logits, predictions = predict_linear(X, w, b)
accuracy = np.mean(predictions == y)
```

{% endtab %}

{% tab gd-linear C++ %}

```cpp
std::pair<VectorXd, VectorXd> predict_linear(
    const MatrixXd& X, const VectorXd& w, double b) {
  VectorXd logits = (X * w).array() + b;
  VectorXd predictions = (logits.array() >= 0.0).cast<double>();
  return {logits, predictions};
}

VectorXd w(2);
w << 1.0, 1.0;
auto [logits, predictions] = predict_linear(X, w, 0.0);
double accuracy = (predictions.array() == y.array()).cast<double>().mean();
```

{% endtab %}

{% tab gd-linear Rust %}

```rust
fn predict_linear(x: &Array2<f64>, w: &Array1<f64>, b: f64) -> (Array1<f64>, Array1<u8>) {
    let logits = x.dot(w) + b;
    let predictions = logits.mapv(|z| u8::from(z >= 0.0));
    (logits, predictions)
}

let w = array![1.0, 1.0];
let (logits, predictions) = predict_linear(&x, &w, 0.0);
let accuracy = predictions.iter().zip(y.iter())
    .filter(|(p, target)| f64::from(**p) == **target)
    .count() as f64 / y.len() as f64;
```

{% endtab %}

{% endtabs %}

<div class="ml-playground" id="gd-boundary-demo">
  <div class="playground-card">
    <div class="control-bar">
      <label>Weight w₁ <output id="gd-boundary-w1-value">1.0</output><input id="gd-boundary-w1" class="custom-slider" type="range" min="-3" max="3" step="0.1" value="1"></label>
      <label>Weight w₂ <output id="gd-boundary-w2-value">-1.0</output><input id="gd-boundary-w2" class="custom-slider" type="range" min="-3" max="3" step="0.1" value="-1"></label>
      <label>Bias b <output id="gd-boundary-b-value">0.0</output><input id="gd-boundary-b" class="custom-slider" type="range" min="-3" max="3" step="0.1" value="0"></label>
    </div>
    <div class="canvas-wrapper"><canvas id="gd-boundary-canvas" width="720" height="400" role="img" aria-label="Fruit points and adjustable linear decision boundary">Interactive boundary plot.</canvas></div>
    <p class="playground-status" id="gd-boundary-status" aria-live="polite"></p>
  </div>
</div>

## 3. Hidden layers need bends

Several linear maps still collapse into one linear map: $$W_2(W_1x+b_1)+b_2$$
can be rearranged as $$Wx+b$$. An **activation function** between layers supplies
the bend needed for curved boundaries. Sigmoid compresses to $$(0,1)$$, tanh to
$$(-1,1)$$, and ReLU keeps positive values while clipping negatives.

Stable activation implementations matter with real model logits: the sigmoid below
avoids overflowing `exp`, while ReLU and tanh are applied elementwise to tensors.

{% tabs gd-activation-code %}

{% tab gd-activation-code Python %}

```python
def sigmoid(z: np.ndarray) -> np.ndarray:
    # Equivalent to scipy.special.expit, written out for clarity.
    out = np.empty_like(z, dtype=np.float64)
    positive = z >= 0
    out[positive] = 1.0 / (1.0 + np.exp(-z[positive]))
    exp_z = np.exp(z[~positive])
    out[~positive] = exp_z / (1.0 + exp_z)
    return out

def relu(z: np.ndarray) -> np.ndarray:
    return np.maximum(z, 0.0)

activations = {
    "sigmoid": sigmoid(logits),
    "tanh": np.tanh(logits),
    "relu": relu(logits),
}
```

{% endtab %}

{% tab gd-activation-code C++ %}

```cpp
VectorXd sigmoid(const VectorXd& z) {
  return z.unaryExpr([](double value) {
    if (value >= 0.0) return 1.0 / (1.0 + std::exp(-value));
    const double exp_value = std::exp(value);
    return exp_value / (1.0 + exp_value);
  });
}

VectorXd relu(const VectorXd& z) {
  return z.cwiseMax(0.0);
}

VectorXd sigmoid_values = sigmoid(logits);
VectorXd tanh_values = logits.array().tanh().matrix();
VectorXd relu_values = relu(logits);
```

{% endtab %}

{% tab gd-activation-code Rust %}

```rust
fn sigmoid(z: &Array1<f64>) -> Array1<f64> {
    z.mapv(|value| {
        if value >= 0.0 {
            1.0 / (1.0 + (-value).exp())
        } else {
            let exp_value = value.exp();
            exp_value / (1.0 + exp_value)
        }
    })
}

fn relu(z: &Array1<f64>) -> Array1<f64> {
    z.mapv(|value| value.max(0.0))
}

let sigmoid_values = sigmoid(&logits);
let tanh_values = logits.mapv(f64::tanh);
let relu_values = relu(&logits);
```

{% endtab %}

{% endtabs %}

<div class="ml-playground" id="gd-activation-demo">
  <div class="playground-card">
    <div class="button-row" role="group" aria-label="Activation function"><button type="button" class="playground-btn is-active" data-activation="sigmoid">Sigmoid</button><button type="button" class="playground-btn" data-activation="tanh">tanh</button><button type="button" class="playground-btn" data-activation="relu">ReLU</button></div>
    <label>Input z <output id="gd-activation-z-value">0.00</output><input id="gd-activation-z" class="custom-slider" type="range" min="-5" max="5" step="0.05" value="0"></label>
    <div class="canvas-wrapper compact"><canvas id="gd-activation-canvas" width="720" height="300" role="img" aria-label="Selected activation function graph">Interactive activation graph.</canvas></div>
    <p class="playground-status" id="gd-activation-status" aria-live="polite"></p>
  </div>
</div>

## 4. Turn mistakes into cost

A prediction needs a score that says how wrong it is. For one example, squared
error is $$C=(a-y)^2$$. It is zero at the target and rises smoothly away from it.

Training minimizes the **mean** loss over a batch. Squared error is standard for
regression; binary cross-entropy is usually the better objective for a binary
classifier. Clipping probabilities keeps `log(0)` from producing infinity.

{% tabs gd-loss %}

{% tab gd-loss Python %}

```python
def mean_squared_error(prediction: np.ndarray, target: np.ndarray) -> float:
    return float(np.mean((prediction - target) ** 2))

def binary_cross_entropy(probability: np.ndarray, target: np.ndarray) -> float:
    p = np.clip(probability, 1e-7, 1.0 - 1e-7)
    return float(-np.mean(target * np.log(p) + (1.0 - target) * np.log(1.0 - p)))

probability = sigmoid(logits)
mse = mean_squared_error(probability, y)
bce = binary_cross_entropy(probability, y)
```

{% endtab %}

{% tab gd-loss C++ %}

```cpp
double mean_squared_error(const VectorXd& prediction, const VectorXd& target) {
  return (prediction - target).array().square().mean();
}

double binary_cross_entropy(const VectorXd& probability, const VectorXd& target) {
  const auto p = probability.array().max(1e-7).min(1.0 - 1e-7);
  return -(target.array() * p.log() + (1.0 - target.array()) * (1.0 - p).log()).mean();
}

VectorXd probability = sigmoid(logits);
double mse = mean_squared_error(probability, y);
double bce = binary_cross_entropy(probability, y);
```

{% endtab %}

{% tab gd-loss Rust %}

```rust
fn mean_squared_error(prediction: &Array1<f64>, target: &Array1<f64>) -> f64 {
    (prediction - target).mapv(|error| error.powi(2)).mean().unwrap()
}

fn binary_cross_entropy(probability: &Array1<f64>, target: &Array1<f64>) -> f64 {
    let p = probability.mapv(|value| value.clamp(1e-7, 1.0 - 1e-7));
    let total: f64 = p.iter().zip(target).map(|(&prob, &truth)| {
        -(truth * prob.ln() + (1.0 - truth) * (1.0 - prob).ln())
    }).sum();
    total / target.len() as f64
}

let probability = sigmoid(&logits);
let mse = mean_squared_error(&probability, &y);
let bce = binary_cross_entropy(&probability, &y);
```

{% endtab %}

{% endtabs %}

<div class="ml-playground" id="gd-cost-demo"><div class="playground-card playground-split">
  <div><label>Prediction a <output id="gd-cost-a-value">0.35</output><input id="gd-cost-a" class="custom-slider" type="range" min="0" max="1" step="0.01" value="0.35"></label><label for="gd-cost-target">Target y</label><select id="gd-cost-target"><option value="0">0</option><option value="1" selected>1</option></select><p class="equation-box" id="gd-cost-status" aria-live="polite"></p></div>
  <div class="canvas-wrapper compact"><canvas id="gd-cost-canvas" width="600" height="300" role="img" aria-label="Squared error curve and current prediction">Interactive cost plot.</canvas></div>
</div></div>

## 5. Walk downhill

For $$L(x)=(x-1)^2+0.15\sin(3x)$$, the exact derivative is
$$L'(x)=2(x-1)+0.45\cos(3x)$$. Gradient descent updates
$$x\leftarrow x-\eta L'(x)$$. Small $$\eta$$ crawls, a useful value settles
quickly, and an excessive value can overshoot.

An optimizer repeatedly evaluates a gradient and updates a parameter. This scalar
version is the same operation an optimizer performs elementwise on large tensors.

{% tabs gd-optimizer %}

{% tab gd-optimizer Python %}

```python
def loss(value: float) -> float:
    return (value - 1.0) ** 2 + 0.15 * np.sin(3.0 * value)

def loss_gradient(value: float) -> float:
    return 2.0 * (value - 1.0) + 0.45 * np.cos(3.0 * value)

parameter = -2.2
learning_rate = 0.15
for step in range(100):
    parameter -= learning_rate * loss_gradient(parameter)
    if abs(loss_gradient(parameter)) < 1e-6:
        break
```

{% endtab %}

{% tab gd-optimizer C++ %}

```cpp
double loss(double value) {
  return std::pow(value - 1.0, 2) + 0.15 * std::sin(3.0 * value);
}

double loss_gradient(double value) {
  return 2.0 * (value - 1.0) + 0.45 * std::cos(3.0 * value);
}

double parameter = -2.2;
const double learning_rate = 0.15;
for (int step = 0; step < 100; ++step) {
  parameter -= learning_rate * loss_gradient(parameter);
  if (std::abs(loss_gradient(parameter)) < 1e-6) break;
}
```

{% endtab %}

{% tab gd-optimizer Rust %}

```rust
fn loss(value: f64) -> f64 {
    (value - 1.0).powi(2) + 0.15 * (3.0 * value).sin()
}

fn loss_gradient(value: f64) -> f64 {
    2.0 * (value - 1.0) + 0.45 * (3.0 * value).cos()
}

let mut parameter = -2.2;
let learning_rate = 0.15;
for _step in 0..100 {
    parameter -= learning_rate * loss_gradient(parameter);
    if loss_gradient(parameter).abs() < 1e-6 { break; }
}
```

{% endtab %}

{% endtabs %}

<div class="ml-playground" id="gd-one-d-demo"><div class="playground-card">
  <div class="control-bar"><label>Learning rate η <output id="gd-one-d-lr-value">0.15</output><input id="gd-one-d-lr" class="custom-slider" type="range" min="0.01" max="1.1" step="0.01" value="0.15"></label></div>
  <div class="button-row"><button type="button" id="gd-one-d-step" class="playground-btn">Step</button><button type="button" id="gd-one-d-run" class="playground-btn playground-btn-primary">Run</button><button type="button" id="gd-one-d-reset" class="playground-btn">Reset</button></div>
  <div class="metrics-row" id="gd-one-d-status" aria-live="polite"></div><div class="canvas-wrapper"><canvas id="gd-one-d-canvas" width="720" height="360" role="img" aria-label="One-dimensional loss function and gradient descent point">Interactive loss graph.</canvas></div>
</div></div>

## 6. A landscape of parameters

A model usually has many adjustable numbers. Here, every point in the plane is a
linear regression model $$\hat y=mx+b$$; color shows its mean squared error. The
trajectory follows the two-component gradient. The cross is the closed-form
least-squares optimum, useful here as a reference.

For linear regression, the residual vector is `X @ w + b - y`. Matrix
multiplication accumulates each parameter's contribution across the whole batch,
producing one gradient for every weight and one for the bias.

{% tabs gd-regression %}

{% tab gd-regression Python %}

```python
def linear_regression_step(
    X: np.ndarray, y: np.ndarray, w: np.ndarray, b: float, learning_rate: float
) -> tuple[np.ndarray, float, float]:
    residual = X @ w + b - y
    batch_size = X.shape[0]
    mse = float(np.mean(residual ** 2))
    dw = (2.0 / batch_size) * X.T @ residual
    db = float(2.0 * np.mean(residual))
    return w - learning_rate * dw, b - learning_rate * db, mse

w = np.zeros(X.shape[1])
b = 0.0
for _ in range(500):
    w, b, mse = linear_regression_step(X, y, w, b, learning_rate=0.08)
```

{% endtab %}

{% tab gd-regression C++ %}

```cpp
double linear_regression_step(const MatrixXd& X, const VectorXd& y,
                              VectorXd& w, double& b, double learning_rate) {
  const VectorXd residual = (X * w).array() + b - y.array();
  const double count = static_cast<double>(X.rows());
  const double mse = residual.squaredNorm() / count;
  const VectorXd dw = (2.0 / count) * X.transpose() * residual;
  const double db = 2.0 * residual.mean();
  w -= learning_rate * dw;
  b -= learning_rate * db;
  return mse;
}

VectorXd regression_w = VectorXd::Zero(X.cols());
double regression_b = 0.0;
for (int step = 0; step < 500; ++step) {
  double mse = linear_regression_step(X, y, regression_w, regression_b, 0.08);
}
```

{% endtab %}

{% tab gd-regression Rust %}

```rust
fn linear_regression_step(
    x: &Array2<f64>, y: &Array1<f64>, w: &mut Array1<f64>, b: &mut f64, learning_rate: f64,
) -> f64 {
    let residual = x.dot(w) + *b - y;
    let count = x.nrows() as f64;
    let mse = residual.mapv(|value| value.powi(2)).sum() / count;
    let dw = x.t().dot(&residual) * (2.0 / count);
    let db = 2.0 * residual.sum() / count;
    *w -= &(dw * learning_rate);
    *b -= learning_rate * db;
    mse
}

let mut regression_w = Array1::zeros(x.ncols());
let mut regression_b = 0.0;
for _step in 0..500 {
    let mse = linear_regression_step(&x, &y, &mut regression_w, &mut regression_b, 0.08);
}
```

{% endtab %}

{% endtabs %}

<div class="ml-playground" id="gd-landscape-demo"><div class="playground-card">
  <div class="control-bar"><label>Learning rate η <output id="gd-landscape-lr-value">0.08</output><input id="gd-landscape-lr" class="custom-slider" type="range" min="0.005" max="0.3" step="0.005" value="0.08"></label></div>
  <div class="button-row"><button type="button" id="gd-landscape-step" class="playground-btn">Step</button><button type="button" id="gd-landscape-run" class="playground-btn playground-btn-primary">Run</button><button type="button" id="gd-landscape-reset" class="playground-btn">Reset</button></div>
  <p class="playground-status" id="gd-landscape-status" aria-live="polite"></p><div class="canvas-wrapper square"><canvas id="gd-landscape-canvas" width="600" height="500" role="img" aria-label="Regression cost heatmap with optimization trajectory">Interactive parameter landscape.</canvas></div>
</div></div>

With three parameters the landscape is three-dimensional; with millions it is a
million-dimensional space. The update rule is unchanged even when we cannot draw it.

## 7. Chain rule becomes backpropagation

For a tiny network,
$$z=wx+b,\quad a=\sigma(z),\quad C=(a-y)^2.$$
The chain rule follows the route from cost back to the weight:

$$
\frac{\partial C}{\partial w}=\frac{\partial C}{\partial a}
\frac{\partial a}{\partial z}\frac{\partial z}{\partial w}
=2(a-y)\,a(1-a)\,x.
$$

Likewise, $$\partial C/\partial b=2(a-y)a(1-a)$$ because
$$\partial z/\partial b=1$$.

Here is one complete forward and backward pass. The returned gradients can be fed
directly to SGD. A useful gradient check compares `dw` with a finite-difference
estimate, but training uses the analytic derivative because it is far cheaper.

{% tabs gd-backprop %}

{% tab gd-backprop Python %}

```python
def neuron_forward_backward(
    x: float, w: float, b: float, target: float
) -> tuple[float, float, float, float]:
    z = w * x + b
    activation = 1.0 / (1.0 + np.exp(-z))
    cost = (activation - target) ** 2

    dcost_da = 2.0 * (activation - target)
    da_dz = activation * (1.0 - activation)
    dcost_dz = dcost_da * da_dz
    dw = dcost_dz * x
    db = dcost_dz
    return activation, cost, dw, db

activation, cost, dw, db = neuron_forward_backward(1.2, 0.8, -0.3, 1.0)
w, b = 0.8 - 0.1 * dw, -0.3 - 0.1 * db
```

{% endtab %}

{% tab gd-backprop C++ %}

```cpp
struct NeuronResult {
  double activation;
  double cost;
  double dw;
  double db;
};

NeuronResult neuron_forward_backward(double x, double w, double b, double target) {
  const double z = w * x + b;
  const double activation = 1.0 / (1.0 + std::exp(-z));
  const double cost = std::pow(activation - target, 2);
  const double dcost_dz = 2.0 * (activation - target) * activation * (1.0 - activation);
  return {activation, cost, dcost_dz * x, dcost_dz};
}

auto result = neuron_forward_backward(1.2, 0.8, -0.3, 1.0);
double neuron_w = 0.8 - 0.1 * result.dw;
double neuron_b = -0.3 - 0.1 * result.db;
```

{% endtab %}

{% tab gd-backprop Rust %}

```rust
struct NeuronResult {
    activation: f64,
    cost: f64,
    dw: f64,
    db: f64,
}

fn neuron_forward_backward(x: f64, w: f64, b: f64, target: f64) -> NeuronResult {
    let z = w * x + b;
    let activation = 1.0 / (1.0 + (-z).exp());
    let cost = (activation - target).powi(2);
    let dcost_dz = 2.0 * (activation - target) * activation * (1.0 - activation);
    NeuronResult { activation, cost, dw: dcost_dz * x, db: dcost_dz }
}

let result = neuron_forward_backward(1.2, 0.8, -0.3, 1.0);
let neuron_w = 0.8 - 0.1 * result.dw;
let neuron_b = -0.3 - 0.1 * result.db;
```

{% endtab %}

{% endtabs %}

<div class="ml-playground" id="gd-chain-demo"><div class="playground-card">
  <div class="control-grid"><label>x <output id="gd-chain-x-value"></output><input id="gd-chain-x" type="range" min="-2" max="2" step="0.1" value="1.2"></label><label>w <output id="gd-chain-w-value"></output><input id="gd-chain-w" type="range" min="-3" max="3" step="0.1" value="0.8"></label><label>b <output id="gd-chain-b-value"></output><input id="gd-chain-b" type="range" min="-2" max="2" step="0.1" value="-0.3"></label><label>target y <select id="gd-chain-target"><option value="0">0</option><option value="1" selected>1</option></select></label></div>
  <div class="node-flow" aria-label="Forward flow"><span>x</span><b>× w, + b</b><span>z</span><b>sigmoid</b><span>a</span><b>squared error</b><span>C</span></div>
  <div class="derivative-grid" id="gd-chain-status" aria-live="polite"></div>
</div></div>

Backpropagation is this same chain rule organized efficiently: each node receives a
reverse sensitivity, multiplies it by its local derivative, and reuses the result
for every incoming parameter.

## 8. Mini-batches and a network that actually learns

**Batch** descent averages every training example before an update. **Stochastic**
descent uses one randomly chosen example. A **mini-batch** sits between them: its
gradient is cheaper than a full batch and less noisy than a single example. Some
noise can help exploration, but very small batches make the loss wobble.

This final demo trains a genuine 2→4→1 network on a deterministic, XOR-like set.
Hidden tanh neurons create nonlinear features; a sigmoid output estimates class 1.

The mini-batch step below is a complete two-layer neural-network update. It performs
a vectorized forward pass, binary cross-entropy/sigmoid backpropagation, and SGD.
Real training code also shuffles examples each epoch, monitors validation metrics,
and checkpoints parameters.

{% tabs gd-network-code %}

{% tab gd-network-code Python %}

```python
rng = np.random.default_rng(7)
X_train = np.array([
    [-0.9, -0.8], [-0.7, -0.6], [0.7, 0.8], [0.9, 0.6],
    [-0.8,  0.7], [-0.6,  0.9], [0.6, -0.8], [0.8, -0.6],
])
y_train = (X_train[:, 0] * X_train[:, 1] > 0).astype(np.float64)

model = {
    "W1": rng.normal(0.0, 0.5, size=(2, 4)),
    "b1": np.zeros(4),
    "W2": rng.normal(0.0, 0.5, size=(4, 1)),
    "b2": np.zeros(1),
}

def train_minibatch(model: dict[str, np.ndarray], Xb: np.ndarray,
                    yb: np.ndarray, learning_rate: float) -> float:
    # Forward: [batch, 2] -> [batch, 4] -> [batch, 1].
    hidden = np.tanh(Xb @ model["W1"] + model["b1"])
    probability = sigmoid(hidden @ model["W2"] + model["b2"])
    target = yb[:, None]
    loss = binary_cross_entropy(probability.ravel(), yb)

    # BCE combined with sigmoid gives dL/dlogit = probability - target.
    dz2 = (probability - target) / Xb.shape[0]
    dW2 = hidden.T @ dz2
    db2 = dz2.sum(axis=0)
    dz1 = (dz2 @ model["W2"].T) * (1.0 - hidden ** 2)
    dW1 = Xb.T @ dz1
    db1 = dz1.sum(axis=0)

    for name, gradient in (("W1", dW1), ("b1", db1), ("W2", dW2), ("b2", db2)):
        model[name] -= learning_rate * gradient
    return loss

for step in range(2_000):
    indices = rng.choice(len(X_train), size=4, replace=False)
    loss = train_minibatch(model, X_train[indices], y_train[indices], 0.12)
```

{% endtab %}

{% tab gd-network-code C++ %}

```cpp
struct TinyNetwork {
  MatrixXd W1;                 // [2, 4]
  Eigen::RowVectorXd b1;       // [1, 4]
  VectorXd W2;                 // [4]
  double b2;
};

double train_minibatch(TinyNetwork& net, const MatrixXd& Xb,
                       const VectorXd& yb, double learning_rate) {
  MatrixXd hidden = ((Xb * net.W1).rowwise() + net.b1).array().tanh();
  VectorXd probability = sigmoid((hidden * net.W2).array() + net.b2);
  const double loss = binary_cross_entropy(probability, yb);

  VectorXd dz2 = (probability - yb) / static_cast<double>(Xb.rows());
  VectorXd dW2 = hidden.transpose() * dz2;
  const double db2 = dz2.sum();
  MatrixXd dz1 = (dz2 * net.W2.transpose()).array() *
                 (1.0 - hidden.array().square());
  MatrixXd dW1 = Xb.transpose() * dz1;
  Eigen::RowVectorXd db1 = dz1.colwise().sum();

  net.W1 -= learning_rate * dW1;
  net.b1 -= learning_rate * db1;
  net.W2 -= learning_rate * dW2;
  net.b2 -= learning_rate * db2;
  return loss;
}

TinyNetwork net{
    (MatrixXd(2, 4) << 0.2, -0.4, 0.3, 0.1,
                       -0.3, 0.2, 0.4, -0.2).finished(),
    Eigen::RowVectorXd::Zero(4),
    (VectorXd(4) << 0.3, -0.2, 0.4, -0.1).finished(),
    0.0,
};

MatrixXd X_batch(4, 2);
X_batch << -0.9, -0.8,
            0.7,  0.8,
           -0.8,  0.7,
            0.6, -0.8;
VectorXd y_batch(4);
y_batch << 1.0, 1.0, 0.0, 0.0;

for (int step = 0; step < 2000; ++step) {
  double loss = train_minibatch(net, X_batch, y_batch, 0.12);
}
```

{% endtab %}

{% tab gd-network-code Rust %}

```rust
struct TinyNetwork {
    w1: Array2<f64>, // [2, 4]
    b1: Array1<f64>, // [4]
    w2: Array1<f64>, // [4]
    b2: f64,
}

fn train_minibatch(net: &mut TinyNetwork, xb: &Array2<f64>,
                   yb: &Array1<f64>, learning_rate: f64) -> f64 {
    let hidden = (xb.dot(&net.w1) + &net.b1).mapv(f64::tanh);
    let logits = hidden.dot(&net.w2) + net.b2;
    let probability = sigmoid(&logits);
    let loss = binary_cross_entropy(&probability, yb);

    let dz2 = (&probability - yb) / xb.nrows() as f64;
    let dw2 = hidden.t().dot(&dz2);
    let db2 = dz2.sum();
    let dz1 = Array2::from_shape_fn(hidden.dim(), |(row, column)| {
        dz2[row] * net.w2[column] * (1.0 - hidden[[row, column]].powi(2))
    });
    let dw1 = xb.t().dot(&dz1);
    let db1 = dz1.sum_axis(Axis(0));

    net.w1 -= &(dw1 * learning_rate);
    net.b1 -= &(db1 * learning_rate);
    net.w2 -= &(dw2 * learning_rate);
    net.b2 -= learning_rate * db2;
    loss
}

let mut net = TinyNetwork {
    w1: array![[0.2, -0.4, 0.3, 0.1], [-0.3, 0.2, 0.4, -0.2]],
    b1: Array1::zeros(4),
    w2: array![0.3, -0.2, 0.4, -0.1],
    b2: 0.0,
};

let x_batch = array![
    [-0.9, -0.8],
    [ 0.7,  0.8],
    [-0.8,  0.7],
    [ 0.6, -0.8],
];
let y_batch = array![1.0, 1.0, 0.0, 0.0];

for _step in 0..2_000 {
    let loss = train_minibatch(&mut net, &x_batch, &y_batch, 0.12);
}
```

{% endtab %}

{% endtabs %}

<div class="ml-playground" id="gd-network-demo"><div class="playground-card">
  <div class="control-grid"><label>Learning rate <output id="gd-network-lr-value">0.12</output><input id="gd-network-lr" type="range" min="0.01" max="0.8" step="0.01" value="0.12"></label><label for="gd-network-batch">Batch size</label><select id="gd-network-batch"><option>1</option><option selected>8</option><option>16</option><option>64</option></select></div>
  <div class="button-row"><button type="button" id="gd-network-step" class="playground-btn">Step batch</button><button type="button" id="gd-network-run" class="playground-btn playground-btn-primary">Run</button><button type="button" id="gd-network-reset" class="playground-btn">Reset</button></div>
  <div class="metrics-row" id="gd-network-status" aria-live="polite"></div><div class="canvas-wrapper square"><canvas id="gd-network-canvas" width="600" height="500" role="img" aria-label="Neural network decision regions and XOR-like data">Interactive neural classifier.</canvas></div>
  <div class="canvas-legend"><span><i class="legend-dot class-zero"></i> class 0</span><span><i class="legend-dot class-one"></i> class 1</span><span>background = predicted probability</span></div>
</div></div>

## From toys to images: applications and limits

Image classification uses the same ingredients at a larger scale. A flattened
28×28 MNIST or Fashion-MNIST image supplies **784 inputs**; **10 outputs** can score
the ten classes. Quick Draw adds varied hand-drawn objects, while CIFAR-10 uses
small color photographs. These browser demos are toy models and do not train on
any of those datasets.

A responsible experiment separates training data from a held-out test set.
Performance can still fall under **distribution shift**—different cameras, drawing
styles, backgrounds, or populations. Augmentation creates plausible transformed
training examples; regularization and validation help detect overfitting. Dense
networks also discard image geometry and require many connections. Convolutional
neural networks share local filters, making them better suited to spatial patterns.

## Experiment checklist

- Rotate and shift the fruit boundary; try $$w_2=0$$.
- Compare sigmoid, tanh, and ReLU near zero and at their extremes.
- Put the cost prediction on and far from its target.
- Compare learning rates around 0.02, 0.15, and 1.0 in the 1D demo.
- Follow the landscape trail to the closed-form cross.
- Change each chain-rule input and identify which derivative factor changes.
- Train the nonlinear model with batch sizes 1, 8, and 64; compare noise and speed.

## Summary

A neuron draws a weighted boundary. Activations let layers bend that boundary. A
cost measures error, gradients point toward local improvement, and the chain rule
delivers those gradients through every layer. Mini-batches make repeated updates
practical. Together these simple mechanisms are enough for the tiny network above
to learn a nonlinear decision region—and form the foundation of much larger models.
