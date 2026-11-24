---
layout: page
title: works
permalink: /works/
description: Research pre-prints, benchmarks, and engineering projects in AI agents, robotics, and full-stack systems.
nav: true
nav_order: 2
display_categories: [work]
---

{% assign sorted_projects = site.projects | sort: "importance", "last" %}
{% assign sorted_policies = site.robot_policies | sort: "order" %}
{% assign posts_in_series = site.posts | where_exp: 'p', 'p.series' %}
{% assign series_count = posts_in_series | group_by: 'series' | size %}
{% assign single_count = site.posts | where_exp: 'p', 'p.series == nil' | size %}
{% assign writing_count = series_count | plus: single_count %}

<nav class="works-nav" aria-label="Works sections">
  <a href="#research"><i class="fa-solid fa-graduation-cap"></i> Research</a>
  <a href="#projects"><i class="fa-solid fa-code"></i> Projects <span class="works-nav-count">{{ sorted_projects.size }}</span></a>
  <a href="#policies"><i class="fa-solid fa-robot"></i> Policies <span class="works-nav-count">{{ sorted_policies.size }}</span></a>
  <a href="#writing"><i class="fa-solid fa-pen-nib"></i> Writing <span class="works-nav-count">{{ writing_count }}</span></a>
</nav>

<div class="works-sections">

  <section id="research" class="works-section">
    <header class="works-section-header">
      <span class="works-section-index">01</span>
      <div>
        <h2 class="works-section-title">Research &amp; Publications</h2>
        <p class="works-section-lead">Pre-prints and benchmarks on AI agents, LLM evaluation, and robotics systems.</p>
      </div>
    </header>

    <div class="publications">
      {% bibliography %}
    </div>

  </section>

  <section id="projects" class="works-section">
    <header class="works-section-header">
      <span class="works-section-index">02</span>
      <div>
        <h2 class="works-section-title">Projects &amp; Systems</h2>
        <p class="works-section-lead">Platforms, agentic workbenches, and robotics systems built for real use.</p>
      </div>
    </header>

    <div class="works-grid">
      {% for project in sorted_projects %}
        {% include projects.liquid %}
      {% endfor %}
    </div>

  </section>

  <section id="policies" class="works-section">
    <header class="works-section-header">
      <span class="works-section-index">03</span>
      <div>
        <h2 class="works-section-title">Robot Policy Explorer</h2>
        <p class="works-section-lead">Step-by-step walkthroughs of the policies we train for the 6-DOF NexArm, each next to a 3D model of the arm.</p>
      </div>
    </header>

    <a class="works-feature" href="{{ '/works/robot-policy/' | relative_url }}">
      <span class="works-feature-icon"><i class="fa-solid fa-robot"></i></span>
      <span class="works-feature-text">
        <strong>Open the explorer</strong>
        <span>Compare all {{ sorted_policies.size }} policies: what each one sees, how it tokenizes, and how many actions it runs before looking again.</span>
      </span>
      <i class="fa-solid fa-arrow-right works-feature-arrow"></i>
    </a>

    <div class="works-grid works-grid-compact">
      {% for policy in sorted_policies %}
        <article class="work-card">
          <div class="work-card-body">
            <span class="series-card-meta">{{ policy.model_name }}</span>
            <h3 class="work-card-title">
              <a href="{{ policy.url | relative_url }}">{{ policy.full_name }}</a>
            </h3>
            <p class="work-card-desc">{{ policy.description }}</p>
            {% if policy.facts %}
              <ul class="work-card-tags">
                {% for fact in policy.facts limit: 2 %}
                  <li>{{ fact.value }} {{ fact.label }}</li>
                {% endfor %}
              </ul>
            {% endif %}
            <div class="work-card-links">
              <a href="{{ policy.url | relative_url }}">Walk through it <i class="fa-solid fa-arrow-right"></i></a>
            </div>
          </div>
        </article>
      {% endfor %}
    </div>

  </section>

  <section id="writing" class="works-section">
    <header class="works-section-header">
      <span class="works-section-index">04</span>
      <div>
        <h2 class="works-section-title">Writing &amp; Explainers</h2>
        <p class="works-section-lead">Interactive explainers and technical notes on how AI systems work under the hood.</p>
      </div>
    </header>

    {% include writing_list.liquid %}

  </section>

</div>
