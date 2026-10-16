# Site design and authoring

The site uses Jekyll and a trimmed al-folio theme. The retained sections are Home,
Works (research and projects), Blog, and CV. The previous interactive ML articles
and template demos were removed; Blog shows an empty state until a post is published.
Personal project drafts remain unpublished.

## Design

Edit the existing Sass partials for typography, navigation, layout, and components.
Colors live in `_sass/_themes.scss`. Prose uses Noto Serif; navigation, metadata, and code use Noto Sans Mono.
Both are hosted in `assets/fonts/` with Latin and Vietnamese subsets, variable
weights, and `font-display: swap`. Font licenses are stored alongside the files.
The accent is blue in both light and dark mode. The theme button cycles through system, light, and
dark, and remembers the setting. Search remains available through the button or
Ctrl/Cmd+K. Bootstrap CSS remains for the retained grid and CV layout. Publication details
use native disclosures, and the sidebar TOC uses a page-specific browser module;
jQuery and Bootstrap JavaScript are no longer required.

## Game of Life divider

Add `life_divider: true` to page frontmatter and place this include in its template
or Markdown content:

```liquid
{% raw %}{% include life-divider.liquid %}{% endraw %}
```

The homepage already includes it. Its small JavaScript module loads only on
enabled pages. The simulation wraps at the edges, pauses offscreen or in hidden
tabs, and has a pause button. Reduced motion shows a static frame. Without
JavaScript, the inline SVG remains visible.

## Article sidenotes

Use standard Markdown footnotes in a `layout: post` article or project:

```markdown
---
layout: post
title: A research note
date: 2026-10-16
sidenotes: true
---

A claim with supporting context.[^context]

[^context]: The supporting context, with normal Markdown links and emphasis.
```

At widths of 1280px and above, notes move into a right margin if they all fit.
They stay as endnotes on smaller screens, with sidebar TOCs, without JavaScript,
and when the margin would overflow. Existing IDs, numbering, and backlinks remain
intact. The positioning script only loads on opted-in pages without a sidebar TOC.

## Libraries and publishing

- Publication disclosures work without JavaScript. The Works filter searches
  publications; `?q=keyword` links to a filtered view without consuming section anchors.
- Enable diagrams explicitly with `mermaid: { enabled: true }`; Mermaid and D3
  otherwise stay unloaded.
- Enable math with `enable_math: true` or `math: true`.
- Images marked `zoomable=true` through the figure include load Medium Zoom.
- Code highlighting and copy buttons load only on pages with code.
- Existing `css:` and `js:` frontmatter arrays support page-specific assets.
- New posts go in `_posts/YYYY-MM-DD-title.md`. Jekyll excludes `published: false`
  drafts from the normal build. Blog and the homepage populate automatically.
- No React, Tailwind, Three.js, or animation library is needed for these features.

## Local preview and checks

Use the existing Docker image and the local startup script configured in Compose.
It forwards shutdown signals and keeps your lockfile intact:

```sh
docker compose up
```

Restart the service after editing `_config.yml`; Jekyll watches content and styles
automatically. The build keeps downloaded vendor bundles intact instead of
re-minifying them, and HTML/inline scripts still use Jekyll minification.

For a production build and the focused checks:

```sh
docker compose run --rm -e JEKYLL_ENV=production jekyll bundle exec jekyll build
npm run test:agentic
npm run test:site
```

Review responsive layouts, theme switching, diagrams, CV, navigation, keyboard
controls, reduced motion, and footnote fallbacks before publishing. The existing
deployment workflow runs the production build, agent-delivery checks, and PurgeCSS.
