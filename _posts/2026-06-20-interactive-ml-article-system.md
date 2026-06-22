---
layout: post
title: "Interactive Machine Learning Article Template"
date: 2026-06-20 09:00:00
published: false
description: "A starter post for ML and deep learning articles with interactive visualizations."
tags: [machine-learning, visualization, interactive, tutorials]
categories: [explanation]
enable_math: true
---

This post is a starter template for the interactive machine learning article series. Keep the article narrative in Markdown, then use reusable interactive figures for concepts that benefit from direct manipulation.

## Pattern

Use prose to introduce one concept, then embed one focused visualization:

{% include interactive.html
  src="/assets/interactive/ml-series/001-linear-regression/gradient-descent.html"
  title="Gradient descent playground"
  caption="Adjust the learning rate and noise to see how the fitted line moves toward the least-squares solution."
  height="640"
  wide=true
%}

## Authoring Notes

Each figure is a standalone HTML file under `assets/interactive/`. Shared figure styles and small utilities live in `assets/interactive/shared/`.

Use this include in future posts:

```liquid
{% raw %}{% include interactive.html
  src="/assets/interactive/ml-series/001-linear-regression/gradient-descent.html"
  title="Gradient descent playground"
  caption="Adjust the learning rate and noise to see convergence behavior."
  height="640"
  wide=true
%}{% endraw %}
```

For larger articles, create one folder per article:

```text
assets/interactive/ml-series/002-neural-networks/
  forward-pass.html
  backpropagation.html
  data.json
```
