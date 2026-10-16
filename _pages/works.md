---
layout: page
title: works
permalink: /works/
description: Research pre-prints, benchmarks, and engineering projects in AI agents, robotics, and full-stack systems.
publications: true
nav: true
nav_order: 2
display_categories: [work]
---

<div class="works-sections">

  <!-- Section 1: Research -->
  <section id="research" class="mb-5">
    <h2>Research & Publications</h2>
    <p class="text-muted">
      Academic research, benchmarks, and pre-prints focusing on AI agents, LLM evaluation, and robotics systems.
    </p>

    <div class="publications">
      {% include bib_search.liquid %}
      {% bibliography %}
    </div>

  </section>

  <!-- Section 2: Projects -->
  <section id="projects" class="mb-5 pt-4">
    <h2>Projects & Systems</h2>
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
