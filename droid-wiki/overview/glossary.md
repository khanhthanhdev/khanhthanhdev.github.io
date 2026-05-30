# Glossary

| Term               | Definition                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **al-folio**       | The upstream Jekyll theme this site is forked from. A clean, responsive academic website template.                                         |
| **Jekyll**         | A static site generator written in Ruby. Processes Markdown and Liquid templates to produce HTML.                                          |
| **Liquid**         | The templating language used by Jekyll. Files use `.liquid` extension and support tags (`{% %}`) and output (`{{ }}`).                     |
| **Collection**     | A Jekyll concept for grouping related content. This site uses collections for posts, projects, news, books, teachings, and bibliography.   |
| **Frontmatter**    | YAML metadata at the top of content files (between `---` delimiters). Controls layout, title, permalink, and other page-specific settings. |
| **BibTeX**         | A reference management format used for academic publications. The `_bibliography/papers.bib` file contains all publication entries.        |
| **jekyll-scholar** | A Jekyll plugin that processes BibTeX files and renders publication lists with citation formatting.                                        |
| **gh-pages**       | The Git branch that GitHub Pages serves. The deployment workflow commits built output here.                                                |
| **PurgeCSS**       | A tool that removes unused CSS selectors from the built site, reducing file size.                                                          |
| **RenderCV**       | A tool for rendering CV data into PDF format. The `assets/rendercv/` directory contains related assets.                                    |
| **Distill**        | A scientific article format with interactive visualizations. Supported via `_layouts/distill.liquid`.                                      |
| **Giscus**         | A comment system for GitHub Pages sites, backed by GitHub Discussions.                                                                     |
| **Liquid tag**     | A template directive in `{% %}` syntax, e.g., `{% include header.liquid %}`.                                                               |
| **Liquid output**  | A template expression in `{{ }}` syntax that renders a value, e.g., `{{ page.title }}`.                                                    |
| **SCSS**           | Sassy CSS, a CSS preprocessor. The `_sass/` directory contains the site's stylesheet source files.                                         |
| **kramdown**       | The Markdown processor used by Jekyll. Supports GFM (GitHub Flavored Markdown) syntax.                                                     |
| **rouge**          | The syntax highlighter used by Jekyll for code blocks.                                                                                     |
| **baseurl**        | A URL prefix for project sites (e.g., `/repo-name/`). Empty for personal sites hosted at the root domain.                                  |
