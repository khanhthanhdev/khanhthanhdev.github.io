---
layout: page
permalink: /blog/
title: Blog
description: Notes on research, robotics, AI agents, and building software.
nav: true
nav_order: 3
---

{% if site.posts.size > 0 %}

<ul class="post-list">
  {% for post in site.posts %}
    <li>
      <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: '%B %d, %Y' }}</time>
      <h2><a href="{% if post.redirect %}{{ post.redirect | relative_url }}{% else %}{{ post.url | relative_url }}{% endif %}">{{ post.title }}</a></h2>
      <p>{{ post.description }}</p>
    </li>
  {% endfor %}
</ul>
{% else %}
<p class="empty-state">No posts yet.</p>
{% endif %}
