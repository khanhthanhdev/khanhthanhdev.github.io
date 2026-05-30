# Dependencies

This page documents all external dependencies: Ruby gems, Node.js packages, and third-party JavaScript libraries.

---

## Ruby gems (Gemfile)

All Ruby dependencies are declared in `Gemfile` and resolved in `Gemfile.lock`.

### Core Jekyll plugins (`:jekyll_plugins` group)

These gems are loaded during the Jekyll build:

| Gem                          | Purpose                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `jekyll`                     | Static site generator (core engine).                                              |
| `jekyll-3rd-party-libraries` | Manages loading of third-party JS/CSS libraries from `_config.yml`.               |
| `jekyll-archives-v2`         | Generates archive pages grouped by year, tags, and categories.                    |
| `jekyll-cache-bust`          | Appends content hashes to asset URLs for cache busting.                           |
| `jekyll-email-protect`       | Obfuscates email addresses in HTML output to prevent scraping.                    |
| `jekyll-feed`                | Generates RSS/Atom feed for the blog.                                             |
| `jekyll-get-json`            | Fetches external JSON data at build time (e.g., resume data).                     |
| `jekyll-imagemagick`         | Generates responsive images in multiple widths and WebP format using ImageMagick. |
| `jekyll-jupyter-notebook`    | Converts Jupyter notebooks (`.ipynb`) to HTML pages.                              |
| `jekyll-link-attributes`     | Adds HTML attributes (e.g., `target="_blank"`, `rel="nofollow"`) to links.        |
| `jekyll-minifier`            | Minifies HTML, CSS, and XML output for production.                                |
| `jekyll-paginate-v2`         | Paginates blog listing pages.                                                     |
| `jekyll-regex-replace`       | Provides regex-based string replacement as a Liquid filter.                       |
| `jekyll/scholar`             | BibTeX bibliography management, citation rendering, and publication pages.        |
| `jekyll-sitemap`             | Generates `sitemap.xml` for search engine indexing.                               |
| `jekyll-socials`             | Renders social media links from `_data/socials.yml`.                              |
| `jekyll-tabs`                | Renders tabbed content blocks in Markdown.                                        |
| `jekyll-terser`              | Minifies JavaScript files using Terser (installed from Git source).               |
| `jekyll-toc`                 | Generates table of contents for pages and posts.                                  |
| `jekyll-twitter-plugin`      | Embeds tweets and Twitter/X content in pages.                                     |
| `jemoji`                     | Converts GitHub-style emoji shortcodes (`:smile:`) to images.                     |
| `classifier-reborn`          | Content categorization used during the build (e.g., related posts).               |

### Supporting gems (`:other_plugins` group)

These gems are used at build time by specific plugins or scripts but are not Jekyll plugins themselves:

| Gem          | Purpose                                                     |
| ------------ | ----------------------------------------------------------- |
| `css_parser` | CSS parsing library (used by `jekyll-cache-bust`).          |
| `feedjira`   | RSS/Atom feed parser (used for external blog sources).      |
| `httparty`   | HTTP client library (used for fetching external data).      |
| `observer`   | Observer pattern implementation (used by `jekyll-scholar`). |
| `ostruct`    | OpenStruct library (used by `jekyll-twitter-plugin`).       |

---

## Node.js packages (package.json)

Node.js dependencies are declared in `package.json` and are used for code formatting, not for the site build itself.

| Package                           | Version   | Type          | Purpose                                                    |
| --------------------------------- | --------- | ------------- | ---------------------------------------------------------- |
| `prettier`                        | `^3.8.0`  | devDependency | Code formatter for Markdown, YAML, HTML, and Liquid files. |
| `@shopify/prettier-plugin-liquid` | `^1.10.0` | devDependency | Prettier plugin for formatting Liquid template files.      |

---

## Third-party JavaScript libraries (third_party_libraries)

These libraries are loaded at runtime in the browser, configured in `_config.yml` under `third_party_libraries`. All are served from jsDelivr CDN by default. Set `third_party_libraries.download: true` to download them locally.

### UI and layout

| Library                         | Version  | Purpose                                                      |
| ------------------------------- | -------- | ------------------------------------------------------------ |
| jQuery                          | `3.6.0`  | DOM manipulation and event handling.                         |
| MDB (Material Design Bootstrap) | `4.20.0` | Material Design UI components for Bootstrap.                 |
| Bootstrap Table                 | `1.22.4` | Interactive HTML tables with sorting, filtering, pagination. |
| Masonry                         | `4.2.2`  | Cascading grid layout for project cards.                     |
| Swiper                          | `11.0.5` | Touch-enabled slider/carousel component.                     |
| ImagesLoaded                    | `5.0.0`  | Detects when images finish loading (used with Masonry).      |

### Data visualization

| Library    | Version  | Purpose                                                 |
| ---------- | -------- | ------------------------------------------------------- |
| Chart.js   | `4.4.1`  | Canvas-based charts and graphs.                         |
| D3.js      | `7.8.5`  | Data-driven DOM manipulation for custom visualizations. |
| ECharts    | `5.5.0`  | Rich interactive charts (includes dark theme).          |
| Plotly.js  | `3.0.1`  | Scientific and statistical charts.                      |
| Vega       | `5.27.0` | Declarative visualization grammar.                      |
| Vega-Lite  | `5.16.3` | High-level grammar for statistical graphics.            |
| Vega-Embed | `6.24.0` | Embeds Vega/Vega-Lite specs in the page.                |

### Code and text rendering

| Library      | Version  | Purpose                                                 |
| ------------ | -------- | ------------------------------------------------------- |
| MathJax      | `3.2.2`  | LaTeX and MathML math rendering.                        |
| Highlight.js | `11.9.0` | Syntax highlighting themes (github / github-dark).      |
| Mermaid      | `10.7.0` | Diagram and flowchart rendering from text definitions.  |
| Pseudocode   | `2.4.1`  | Renders algorithm pseudocode in LaTeX-style formatting. |
| Diff2Html    | `3.4.47` | Renders unified diffs as formatted HTML.                |

### Media and galleries

| Library               | Version  | Purpose                                              |
| --------------------- | -------- | ---------------------------------------------------- |
| PhotoSwipe            | `5.4.4`  | Fullscreen image gallery/lightbox.                   |
| PhotoSwipe Lightbox   | `5.4.4`  | Lightbox component for PhotoSwipe.                   |
| Lightbox2             | `2.11.5` | Overlay lightbox for image galleries.                |
| VenoBox               | `2.1.8`  | Responsive lightbox for images, videos, and iframes. |
| Spotlight.js          | `0.7.8`  | Image gallery with lightbox.                         |
| Medium Zoom           | `1.1.0`  | Medium-style image zoom on click.                    |
| Img Comparison Slider | `8.0.6`  | Before/after image comparison slider.                |

### Maps

| Library | Version | Purpose                                   |
| ------- | ------- | ----------------------------------------- |
| Leaflet | `1.9.4` | Interactive maps with markers and layers. |

### Utilities

| Library               | Version | Purpose                                                  |
| --------------------- | ------- | -------------------------------------------------------- |
| Google Fonts          | —       | Loads Roboto, Roboto Slab, and Material Icons web fonts. |
| Polyfill.io           | `3`     | Browser polyfills for ES6+ features.                     |
| Vanilla CookieConsent | `3.1.0` | GDPR-compliant cookie consent banner.                    |

---

## System dependencies

Beyond Ruby and Node.js, the build requires these system-level tools:

| Tool                 | Purpose                                         | Required when                                     |
| -------------------- | ----------------------------------------------- | ------------------------------------------------- |
| ImageMagick          | Responsive image generation (`convert` command) | `imagemagick.enabled: true` in `_config.yml`      |
| Python 3 + nbconvert | Jupyter notebook conversion                     | Building notebooks with `jekyll-jupyter-notebook` |
| Git                  | Version control and safe directory management   | Always (for deployment and Docker entry point)    |

---

## Related pages

- [Configuration](configuration.md) — Where these libraries are configured in `_config.yml`
- [Data models](data-models.md) — Data files processed by these plugins
- [Deployment](../deployment.md) — How dependencies are installed during CI/CD
