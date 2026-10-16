---
layout: page
title: works
permalink: /works/
description: Research pre-prints, benchmarks, and engineering projects in AI agents, robotics, and full-stack systems.
nav: true
nav_order: 2
display_categories: [work]
---

<div class="works-sections">

  <!-- Section 1: Research -->
  <section id="research" class="mb-5">
    <div class="d-flex justify-content-between align-items-baseline border-bottom pb-2 mb-4">
      <h2 class="section-title mb-0">
        <i class="fa-solid fa-graduation-cap mr-2"></i>Research & Publications
      </h2>
      <span class="badge badge-pill badge-primary">Pre-prints & Papers</span>
    </div>
    <p class="text-muted">
      Academic research, benchmarks, and pre-prints focusing on AI agents, LLM evaluation, and robotics systems.
    </p>

    <div class="publications">
      {% bibliography %}
    </div>

  </section>

  <!-- Section 2: Projects -->
  <section id="projects" class="mb-5 pt-4">
    <div class="d-flex justify-content-between align-items-baseline border-bottom pb-2 mb-4">
      <h2 class="section-title mb-0">
        <i class="fa-solid fa-code mr-2"></i>Projects & Systems
      </h2>
      <span class="badge badge-pill badge-secondary">Full-Stack & Robotics</span>
    </div>
    <p class="text-muted">
      Interactive platforms, agentic workbenches, and robotics tournament management systems built for real-world impact.
    </p>

    <div class="projects">
      {% assign sorted_projects = site.projects | sort: "importance" %}
      <ul>
        {% for project in sorted_projects %}
          {% include projects.liquid %}
        {% endfor %}
      </ul>
    </div>

  </section>

</div>
