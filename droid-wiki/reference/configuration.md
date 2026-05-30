# Configuration Reference

All site configuration lives in `_config.yml` at the repository root. This page documents every setting, organized by section.

---

## Site settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `title` | string | `Tran Khanh Thanh` | The website title. If blank, the full name is used. |
| `first_name` | string | `Tran` | Author's first name. |
| `middle_name` | string | `Khanh` | Author's middle name. |
| `last_name` | string | `Thanh` | Author's last name. |
| `contact_note` | string | `Please send me an email…` | Text displayed on the contact section of the about page. |
| `description` | string | `My personal website…` | Site description used in meta tags and RSS feed. |
| `footer_text` | string | `Powered by Jekyll…` | HTML text displayed in the site footer. |
| `keywords` | string | `jekyll, jekyll-theme…` | Comma-separated keywords for SEO meta tags. |
| `lang` | string | `en` | Site language code (e.g., `en`, `fr`, `cn`, `ru`). |
| `icon` | string | `👨🏻‍💻` | Emoji used as the favicon. Alternatively, provide an image filename in `/assets/img/`. |
| `url` | string | `https://khanhthanhdev.github.io` | Base hostname and protocol for the site. |
| `baseurl` | string | `""` | Subpath of the site (e.g., `/blog/`). Leave blank for root. |
| `last_updated` | boolean | `false` | Whether to display "last updated" date in the footer. |
| `impressum_path` | string | *(empty)* | Path to an impressum page for EU GDPR conformance. Uses the same path as the page's permalink. |
| `back_to_top` | boolean | `true` | Whether to show a "back to top" button. |

---

## Theme

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `repo_theme_light` | string | `default` | GitHub readme stats theme for light mode. See [available themes](https://github.com/anuraghazra/github-readme-stats/blob/master/themes/README.md). |
| `repo_theme_dark` | string | `dark` | GitHub readme stats theme for dark mode. |
| `repo_trophies.enabled` | boolean | `true` | Whether to display GitHub profile trophies on the repositories page. |
| `repo_trophies.theme_light` | string | `flat` | Trophy theme for light mode. See [trophy themes](https://github.com/ryo-ma/github-profile-trophy). |
| `repo_trophies.theme_dark` | string | `gitdimmed` | Trophy theme for dark mode. |
| `external_services.github_readme_stats_url` | string | `https://github-readme-stats.vercel.app` | Base URL for the GitHub readme stats service. |
| `external_services.github_profile_trophy_url` | string | `https://github-profile-trophy.vercel.app` | Base URL for the GitHub profile trophy service. |

---

## RSS Feed

The RSS feed uses the `jekyll-feed` plugin and automatically picks up the `title` and `url` fields from Site settings. See the [jekyll-feed documentation](https://github.com/jekyll/jekyll-feed) for additional customization options.

---

## Layout

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `navbar_fixed` | boolean | `true` | Whether the navigation bar is fixed at the top on scroll. |
| `footer_fixed` | boolean | `true` | Whether the footer is fixed at the bottom. |
| `search_enabled` | boolean | `true` | Enables the site-wide search feature. |
| `socials_in_search` | boolean | `true` | Include social media links in search results. |
| `posts_in_search` | boolean | `true` | Include blog posts in search results. |
| `bib_search` | boolean | `true` | Include bibliography entries in search results. |
| `max_width` | string | `930px` | Maximum content width of the site. |

---

## Open Graph & Schema.org

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `serve_og_meta` | boolean | `true` | Include Open Graph meta tags in the HTML `<head>` for social media previews. |
| `serve_schema_org` | boolean | `true` | Include Schema.org structured data in the HTML `<head>`. |
| `og_image` | string | *(empty)* | Site-wide default Open Graph preview image URL. Individual pages can override this. |

---

## Analytics and search engine verification

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `google_analytics` | string | *(empty)* | Google Analytics measurement ID (format: `G-XXXXXXXXXX`). |
| `cronitor_analytics` | string | *(empty)* | Cronitor RUM analytics site ID. |
| `pirsch_analytics` | string | *(empty)* | Pirsch analytics site ID (32 characters). |
| `openpanel_analytics` | string | *(empty)* | Openpanel analytics client ID (format: `XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`). |
| `google_site_verification` | string | *(empty)* | Google Search Console verification ID. |
| `bing_site_verification` | string | *(empty)* | Bing Webmaster verification ID. |

---

## Blog

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `blog_name` | string | `al-folio` | Display name shown on the blog page. |
| `blog_description` | string | `a simple whitespace theme for academics` | Description shown on the blog page. |
| `permalink` | string | `/blog/:year/:title/` | URL structure for blog posts. |
| `lsi` | boolean | `false` | Produce a latent semantic index for related posts (slow build). |
| `pagination.enabled` | boolean | `true` | Enable pagination on the blog page. |
| `related_blog_posts.enabled` | boolean | `true` | Show related posts at the bottom of each post. |
| `related_blog_posts.max_related` | integer | `5` | Maximum number of related posts to display. |

### Giscus comments

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `giscus.repo` | string | *(empty)* | GitHub repository for Giscus discussions (`user/repo`). |
| `giscus.repo_id` | string | *(empty)* | Giscus repo ID (from [giscus.app](https://giscus.app/)). |
| `giscus.category` | string | `Comments` | Discussion category name. |
| `giscus.category_id` | string | *(empty)* | Giscus category ID. |
| `giscus.mapping` | string | `title` | How discussions are mapped to pages (`title`, `url`, etc.). |
| `giscus.strict` | integer | `1` | Use strict identification mode. |
| `giscus.reactions_enabled` | integer | `1` | Enable emoji reactions (`1`) or disable (`0`). |
| `giscus.input_position` | string | `bottom` | Position of comment input form (`bottom` or `top`). |
| `giscus.dark_theme` | string | `dark` | Dark color scheme name for Giscus. |
| `giscus.light_theme` | string | `light` | Light color scheme name for Giscus. |
| `giscus.emit_metadata` | integer | `0` | Emit discussion metadata. |
| `giscus.lang` | string | `en` | Giscus UI language. |

### Disqus comments (deprecated)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `disqus_shortname` | string | `al-folio` | Disqus shortname for legacy comment support. |

### External sources

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `external_sources` | array | `[]` | List of external blog sources with RSS feeds or direct post URLs. Each entry can have `name`, `rss_url` or `posts`, `categories`, and `tags`. |

---

## Newsletter

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `newsletter.enabled` | boolean | `false` | Enable newsletter signup form. |
| `newsletter.endpoint` | string | *(empty)* | Loops.so newsletter endpoint URL. |

---

## Collections

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `collections.books` | object | `{output: true}` | Book review collection. |
| `collections.news` | object | `{defaults: {layout: post}, output: true}` | News/announcements collection. |
| `collections.projects` | object | `{output: true}` | Projects collection. |
| `collections.teachings` | object | `{output: true}` | Teaching/courses collection. |
| `announcements.enabled` | boolean | `true` | Display announcements on the about page. |
| `announcements.scrollable` | boolean | `true` | Add a vertical scrollbar if more than 3 news items. |
| `announcements.limit` | integer | `5` | Maximum news items to display (blank = all). |
| `latest_posts.enabled` | boolean | `true` | Display latest blog posts on the about page. |
| `latest_posts.scrollable` | boolean | `false` | Add a vertical scrollbar for latest posts. |
| `latest_posts.limit` | integer | `3` | Maximum recent posts to display (blank = all). |

---

## Jekyll settings

### Markdown and syntax highlighting

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `markdown` | string | `kramdown` | Markdown processor. |
| `highlighter` | string | `rouge` | Syntax highlighter. |
| `kramdown.input` | string | `GFM` | Kramdown input mode (GitHub Flavored Markdown). |
| `kramdown.syntax_highlighter_opts.css_class` | string | `highlight` | CSS class for code blocks. |
| `kramdown.syntax_highlighter_opts.span.line_numbers` | boolean | `false` | Show line numbers in inline code. |
| `kramdown.syntax_highlighter_opts.block.line_numbers` | boolean | `false` | Show line numbers in code blocks. |
| `kramdown.syntax_highlighter_opts.block.start_line` | integer | `1` | Starting line number. |

### Includes and excludes

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `include` | array | `["_pages", "_scripts"]` | Additional directories to include in the build. |
| `exclude` | array | *(see config)* | Files and directories to exclude from the build output. |
| `keep_files` | array | `["CNAME", ".nojekyll"]` | Files to preserve in the output directory during build. |

### Sass

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `sass.style` | string | `compressed` | Sass output style (`compressed` or `expanded`). |

---

## Plugins

The `plugins` array lists all Jekyll plugins loaded during the build:

| Plugin | Purpose |
|--------|---------|
| `jekyll-3rd-party-libraries` | Manages third-party JS/CSS library loading. |
| `jekyll-archives-v2` | Generates archive pages for posts by year, tags, categories. |
| `jekyll-cache-bust` | Appends cache-busting hashes to asset URLs. |
| `jekyll-email-protect` | Obfuscates email addresses to prevent scraping. |
| `jekyll-feed` | Generates an RSS/Atom feed for the blog. |
| `jekyll-get-json` | Fetches external JSON data at build time. |
| `jekyll-imagemagick` | Generates responsive images using ImageMagick. |
| `jekyll-jupyter-notebook` | Renders Jupyter notebooks as pages. |
| `jekyll-link-attributes` | Adds attributes (e.g., `target="_blank"`) to links. |
| `jekyll-minifier` | Minifies HTML, CSS, and XML output. |
| `jekyll-paginate-v2` | Paginates blog listing pages. |
| `jekyll-regex-replace` | Provides regex-based string replacement in Liquid. |
| `jekyll/scholar` | BibTeX bibliography and citation management. |
| `jekyll-sitemap` | Generates a `sitemap.xml` for search engines. |
| `jekyll-socials` | Renders social media links from `_data/socials.yml`. |
| `jekyll-tabs` | Renders tabbed content blocks. |
| `jekyll-terser` | Minifies JavaScript using Terser. |
| `jekyll-toc` | Generates a table of contents for pages. |
| `jekyll-twitter-plugin` | Embeds tweets and other Twitter/X content. |
| `jemoji` | Converts GitHub-style emoji shortcodes to images. |

---

## Jekyll Minifier

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `jekyll-minifier.compress_javascript` | boolean | `false` | Compress JavaScript (disabled because `jekyll-terser` handles JS minification). |
| `jekyll-minifier.exclude` | array | `["robots.txt", "assets/js/search/*.js"]` | Files to exclude from minification. |

---

## Terser

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `terser.compress.drop_console` | boolean | `true` | Strip `console.*` calls from production JavaScript. |

---

## Archives

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `jekyll-archives.posts.enabled` | array | `[year, tags, categories]` | Archive types to generate for blog posts. |
| `jekyll-archives.posts.permalinks.year` | string | `/blog/:year/` | URL pattern for year archives. |
| `jekyll-archives.posts.permalinks.tags` | string | `/blog/:type/:name/` | URL pattern for tag archives. |
| `jekyll-archives.posts.permalinks.categories` | string | `/blog/:type/:name/` | URL pattern for category archives. |
| `jekyll-archives.books.enabled` | array | `[year, tags, categories]` | Archive types to generate for books. |
| `display_tags` | array | `["formatting", "images", "links", "math", "code", "blockquotes"]` | Tags shown on the blog front page. |
| `display_categories` | array | `["external-services"]` | Categories shown on the blog front page. |

---

## Scholar

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `scholar.last_name` | array | `[Einstein]` | Author's last name(s) for highlighting in bibliography. |
| `scholar.first_name` | array | `[Albert, A.]` | Author's first name(s)/initials. |
| `scholar.style` | string | `apa` | Citation style (APA, IEEE, etc.). |
| `scholar.locale` | string | `en` | Locale for citation formatting. |
| `scholar.source` | string | `/_bibliography/` | Directory containing `.bib` files. |
| `scholar.bibliography` | string | `papers.bib` | Main bibliography file name. |
| `scholar.bibliography_template` | string | `bib` | Liquid template for rendering entries. |
| `scholar.bibtex_filters` | array | `[latex, smallcaps, superscript]` | BibTeX text filters. |
| `scholar.replace_strings` | boolean | `true` | Replace BibTeX string abbreviations. |
| `scholar.join_strings` | boolean | `true` | Concatenate BibTeX string values. |
| `scholar.details_dir` | string | `bibliography` | Directory for publication detail pages. |
| `scholar.details_link` | string | `Details` | Text for the details link. |
| `scholar.query` | string | `@*` | BibTeX query filter (all entries). |
| `scholar.group_by` | string | `year` | Group publications by this field. |
| `scholar.group_order` | string | `descending` | Sort order for groups. |

### Publication badges

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enable_publication_badges.altmetric` | boolean | `true` | Show [Altmetric](https://badge-docs.altmetric.com/) badges on publications. |
| `enable_publication_badges.dimensions` | boolean | `true` | Show [Dimensions](https://badge.dimensions.ai/) badges. |
| `enable_publication_badges.google_scholar` | boolean | `true` | Show Google Scholar citation badges. |
| `enable_publication_badges.inspirehep` | boolean | `true` | Show [Inspire HEP](https://help.inspirehep.net/) badges. |

### Filtered BibTeX keywords

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `filtered_bibtex_keywords` | array | *(see config)* | BibTeX entry keywords that are filtered from the rendered output but used internally (e.g., `abbr`, `abstract`, `arxiv`, `pdf`, `code`, `video`, `slides`, `poster`, etc.). |

### Author display

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `max_author_limit` | integer | `3` | Maximum authors shown per publication before collapsing. Blank shows all. |
| `more_authors_animation_delay` | integer | `10` | Animation delay (ms) for revealing hidden authors on click. |
| `enable_publication_thumbnails` | boolean | `true` | Show thumbnails on publications if specified in the bib entry. |

---

## External links

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `external_links.enabled` | boolean | `true` | Add attributes to external links. |
| `external_links.rel` | string | `external nofollow noopener` | `rel` attribute value. |
| `external_links.target` | string | `_blank` | `target` attribute value. |
| `external_links.exclude` | string | *(empty)* | URL patterns to exclude from attribute injection. |

---

## Image processing

### ImageMagick (responsive WebP images)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `imagemagick.enabled` | boolean | `true` | Enable responsive image generation. Requires ImageMagick installed. |
| `imagemagick.widths` | array | `[480, 800, 1400]` | Output widths for responsive images. |
| `imagemagick.input_directories` | array | `["assets/img/"]` | Directories to scan for source images. |
| `imagemagick.input_formats` | array | `[".jpg", ".jpeg", ".png", ".tiff", ".gif"]` | Source image formats to process. |
| `imagemagick.output_formats.webp` | string | `-auto-orient -quality 85` | WebP output format with ImageMagick options. |

### Lazy loading

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `lazy_loading_images` | boolean | `true` | Add `loading="lazy"` to all images. Set to `"eager"` or `"auto"` per-image to override. |

---

## Optional features

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enable_google_analytics` | boolean | `false` | Enable Google Analytics tracking. |
| `enable_cronitor_analytics` | boolean | `false` | Enable Cronitor RUM analytics. |
| `enable_pirsch_analytics` | boolean | `false` | Enable Pirsch analytics. |
| `enable_openpanel_analytics` | boolean | `false` | Enable Openpanel analytics. |
| `enable_google_verification` | boolean | `false` | Enable Google Search Console verification meta tag. |
| `enable_bing_verification` | boolean | `false` | Enable Bing Webmaster verification meta tag. |
| `enable_cookie_consent` | boolean | `false` | Enable GDPR-compliant cookie consent dialog. |
| `enable_masonry` | boolean | `true` | Enable masonry layout for project cards. |
| `enable_math` | boolean | `true` | Enable MathJax math typesetting. |
| `enable_tooltips` | boolean | `false` | Enable automatic tooltip links on section titles. |
| `enable_darkmode` | boolean | `true` | Enable light/dark mode toggle. |
| `enable_navbar_social` | boolean | `true` | Show social links in the navbar on the about page. |
| `enable_project_categories` | boolean | `true` | Enable project categorization with multiple categories. |
| `enable_medium_zoom` | boolean | `true` | Enable Medium-style image zoom on click. |
| `enable_progressbar` | boolean | `true` | Show a horizontal progress bar linked to scroll position. |
| `enable_video_embedding` | boolean | `false` | Embed videos in bibtex entries. If `false`, opens video links in a new window. |

---

## Library versions

The `third_party_libraries` section defines all external JavaScript and CSS libraries loaded by the site. Each library specifies a `version`, CDN `url` (with `{{version}}` placeholder), and optional `integrity` hashes for subresource verification.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `third_party_libraries.download` | boolean | `false` | If `true`, download library files locally instead of using CDN. |

### Configured libraries

| Library | Version | Purpose |
|---------|---------|---------|
| `bootstrap-table` | `1.22.4` | Interactive HTML tables with sorting, filtering, pagination. |
| `chartjs` | `4.4.1` | Canvas-based charts and visualizations. |
| `d3` | `7.8.5` | Data-driven document manipulation and visualization. |
| `diff2html` | `3.4.47` | Renders unified diffs as HTML. |
| `echarts` | `5.5.0` | Rich interactive charts (includes dark theme). |
| `google_fonts` | — | Loads Roboto, Roboto Slab, and Material Icons web fonts. |
| `highlightjs` | `11.9.0` | Syntax highlighting themes (light: github, dark: github-dark). |
| `imagesloaded` | `5.0.0` | Detects when images have finished loading (used with Masonry). |
| `img-comparison-slider` | `8.0.6` | Before/after image comparison slider. |
| `jquery` | `3.6.0` | DOM manipulation library. |
| `leaflet` | `1.9.4` | Interactive maps. |
| `lightbox2` | `2.11.5` | Overlay lightbox for image galleries. |
| `mathjax` | `3.2.2` | LaTeX and MathML rendering. |
| `masonry` | `4.2.2` | Cascading grid layout library. |
| `mdb` | `4.20.0` | Material Design Bootstrap components. |
| `medium_zoom` | `1.1.0` | Medium-style image zoom. |
| `mermaid` | `10.7.0` | Diagram and flowchart rendering from text. |
| `photoswipe` | `5.4.4` | Fullscreen image gallery/lightbox. |
| `photoswipe-lightbox` | `5.4.4` | Lightbox component for PhotoSwipe. |
| `plotly` | `3.0.1` | Interactive scientific charts. |
| `polyfill` | `3` | Browser polyfills for ES6+ features. |
| `pseudocode` | `2.4.1` | Renders algorithm pseudocode in LaTeX-style. |
| `spotlight` | `0.7.8` | Image gallery with lightbox. |
| `swiper` | `11.0.5` | Touch-enabled slider/carousel. |
| `vanilla-cookieconsent` | `3.1.0` | GDPR cookie consent banner. |
| `vega` | `5.27.0` | Declarative visualization grammar. |
| `vega-embed` | `6.24.0` | Embeds Vega/Vega-Lite visualizations. |
| `vega-lite` | `5.16.3` | High-level grammar for statistical graphics. |
| `venobox` | `2.1.8` | Responsive lightbox for images, videos, iframes. |

---

## Get external JSON data

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `jekyll_get_json` | array | `[{data: resume, json: assets/json/resume.json}]` | External JSON files to load at build time. |
| `jsonresume` | array | *(see config)* | JSON Resume sections to render (basics, work, education, publications, projects, volunteer, awards, certificates, skills, languages, interests, references). |

---

## Related pages

- [Data models](data-models.md) — Schema documentation for `_data/` YAML files
- [Dependencies](dependencies.md) — Ruby gems and Node.js packages
- [Deployment](../deployment.md) — How the site is built and deployed
