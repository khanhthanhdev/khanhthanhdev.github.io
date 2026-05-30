# Blog

The blog system supports posts with categories, tags, pagination, related post suggestions, table of contents, and comment integration. Posts are rendered through the `post` layout defined in `_layouts/post.liquid`.

## Post Format

Blog posts live in `_posts/` and follow Jekyll's naming convention: `YYYY-MM-DD-title-with-hyphens.md`.

**Frontmatter fields:**

| Field                  | Description                                     | Default |
| ---------------------- | ----------------------------------------------- | ------- |
| `layout`               | Always `post`                                   | —       |
| `title`                | Post title                                      | —       |
| `date`                 | Publication date (`YYYY-MM-DD HH:MM:SS`)        | —       |
| `description`          | Short description for previews and meta tags    | —       |
| `tags`                 | Array or space-separated tags                   | —       |
| `categories`           | Array or space-separated categories             | —       |
| `featured`             | Pin to top of blog listing                      | `false` |
| `redirect`             | Redirect to URL instead of rendering content    | —       |
| `thumbnail`            | Path to thumbnail image for the listing         | —       |
| `toc`                  | Table of contents configuration                 | —       |
| `giscus_comments`      | Enable Giscus comments                          | `true`  |
| `related_posts`        | Show related posts section                      | `true`  |
| `disqus_comments`      | Enable Disqus comments (deprecated)             | `false` |
| `citation`             | Show a citation block at the bottom             | —       |
| `related_publications` | Link bibliography entries from `_bibliography/` | —       |
| `last_updated`         | Date of last update                             | —       |
| `meta`                 | Additional metadata text in the post header     | —       |
| `author`               | Author name                                     | —       |
| `_styles`              | Custom CSS injected into the post               | —       |

**Example:**

```yaml
---
layout: post
title: my awesome post
date: 2026-05-30 12:00:00
description: what this post is about
tags: [topic1, topic2]
categories: [research]
thumbnail: assets/img/thumbnail.jpg
toc:
  sidebar: true
---
```

## Categories and Tags

Categories and tags enable automatic archive pages via the `jekyll-archives-v2` plugin. Configuration in `_config.yml`:

```yaml
jekyll-archives:
  posts:
    enabled: [year, tags, categories]
    permalinks:
      year: "/blog/:year/"
      tags: "/blog/:type/:name/"
      categories: "/blog/:type/:name/"
```

Featured tags and categories can be highlighted on the blog index page:

```yaml
display_tags: ["formatting", "images", "links", "math", "code", "blockquotes"]
display_categories: ["external-services"]
```

## Pagination

Pagination is enabled by default:

```yaml
pagination:
  enabled: true
```

This uses the `jekyll-paginate-v2` plugin. The blog listing page shows posts with pagination controls at the bottom. The number of posts per page and other pagination options can be configured under the `pagination` key.

## Table of Contents

Posts support two TOC modes configured via frontmatter:

**Inline TOC** (rendered at the top of the post):

```yaml
toc:
  beginning: true
```

**Sidebar TOC** (persistent navigation while scrolling):

```yaml
toc:
  sidebar: true      # left sidebar (default)
  sidebar: right     # right sidebar
```

When `sidebar` is set, the inline TOC is automatically disabled. The sidebar TOC highlights the current section as the user scrolls and collapses to the top on mobile devices.

## Related Posts

Related posts are shown at the bottom of each post when enabled:

```yaml
# _config.yml
related_blog_posts:
  enabled: true
  max_related: 5
```

Per-post opt-out:

```yaml
related_posts: false
```

The related posts section is rendered by `_includes/related_posts.liquid`, which uses Jekyll's built-in `site.related_posts` and displays links to up to `max_related` posts.

## Latest Posts Widget

The homepage can display a latest posts widget configured in `_config.yml`:

```yaml
latest_posts:
  enabled: true
  scrollable: false
  limit: 3
```

Rendered by `_includes/latest_posts.liquid`, which shows a table of recent posts with dates and titles.

## Comments

### Giscus (Recommended)

Giscus is a comments system backed by GitHub Discussions. Configuration in `_config.yml`:

```yaml
giscus:
  repo: owner/repo
  repo_id: ...
  category: Comments
  category_id: ...
  mapping: title
  strict: 1
  reactions_enabled: 1
  input_position: bottom
  dark_theme: dark
  light_theme: light
  emit_metadata: 0
  lang: en
```

Per-post opt-out:

```yaml
giscus_comments: false
```

The Giscus script is loaded by `_scripts/giscus-setup.js` and rendered by `_includes/giscus.liquid`.

### Disqus (Deprecated)

Disqus is supported but deprecated. Set `disqus_shortname` in `_config.yml` and `disqus_comments: true` in post frontmatter.

## External Sources

External blog posts (e.g., from Medium) can be aggregated into the blog listing via RSS:

```yaml
external_sources:
  - name: medium.com
    rss_url: https://medium.com/@user/feed
    categories: [external-posts]
    tags: [medium]
  - name: Google Blog
    posts:
      - url: https://blog.google/technology/ai/...
        published_date: 2024-05-14
    categories: [external-posts]
    tags: [google]
```

External posts are fetched at build time by `_plugins/external-posts.rb` and rendered alongside native posts.

## Redirect Posts

Posts can redirect to external URLs or local files:

```yaml
---
layout: post
title: download paper
redirect: /assets/pdf/paper.pdf
---
```

The redirect behavior is handled in the post listing and layout templates.

## Jupyter Notebooks

Jupyter notebooks can be embedded in posts using the `jekyll-jupyter-notebook` plugin. See the blog guide post at `_posts/2026-05-30-how-to-write-blog.md` for the include syntax.

## Newsletter

An optional newsletter signup can appear after related posts:

```yaml
newsletter:
  enabled: false
  endpoint: https://app.loops.so/api/newsletter-form/YOUR-ENDPOINT
```

## Related Pages

- [Content Collections](content-collections.md) — How posts fit into the collection system
- [Theming and Styling](theming-and-styling.md) — Blog-specific SCSS in `_sass/_blog.scss`
- [Analytics and Search](analytics-and-search.md) — Posts in search results
