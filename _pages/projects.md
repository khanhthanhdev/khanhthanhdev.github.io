---
layout: page
title: projects
permalink: /projects/
description: A growing collection of your cool projects.
nav: true
nav_order: 3
display_categories: [work, fun]
---

<!-- pages/projects.md -->
<div class="projects">
{% if site.enable_project_categories and page.display_categories %}
  {% for category in page.display_categories %}
  <a id="{{ category }}" href=".#{{ category }}">
    <h4 class="category">{{ category }}</h4>
  </a>
  {% assign categorized_projects = site.projects | where: "category", category %}
  {% assign sorted_projects = categorized_projects | sort: "importance" %}
  <ul>
    {% for project in sorted_projects %}
      {% include projects.liquid %}
    {% endfor %}
  </ul>
  {% endfor %}

{% else %}
{% assign sorted_projects = site.projects | sort: "importance" %}

<ul>
  {% for project in sorted_projects %}
    {% include projects.liquid %}
  {% endfor %}
</ul>
{% endif %}
</div>
