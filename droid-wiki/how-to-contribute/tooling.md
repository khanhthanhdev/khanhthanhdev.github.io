# Tooling

This page covers the build system, development tools, and CI workflows used in the project.

## Jekyll

The site is built with [Jekyll](https://jekyllrb.com/) v4.x, a Ruby static site generator. Jekyll processes Liquid templates, Markdown content, SCSS, and BibTeX into a static HTML site.

### Key plugins (from `Gemfile`)

| Plugin | Purpose |
|--------|---------|
| `jekyll-scholar` | BibTeX bibliography management |
| `jekyll-paginate-v2` | Pagination for blog and other listings |
| `jekyll-archives-v2` | Archive page generation |
| `jekyll-minifier` | CSS/JS minification in production |
| `jekyll-toc` | Table of contents generation |
| `jekyll-tabs` | Tab UI components |
| `jemoji` | Emoji support |
| `jekyll-feed` | RSS/Atom feed generation |
| `jekyll-sitemap` | Sitemap generation |
| `jekyll-jupyter-notebook` | Jupyter notebook embedding |
| `jekyll-imagemagick` | Image processing (requires ImageMagick) |
| `jekyll-cache-bust` | Cache-busting for static assets |
| `jekyll-socials` | Social media link rendering |
| `classifier-reborn` | Related posts calculation |

## Docker

Docker is the recommended local development environment. The image is based on `ruby:slim` and includes Ruby, Node.js, Python 3, ImageMagick, and nbconvert.

### Files

- `Dockerfile` — image definition. Installs system deps, Ruby gems, and Python packages.
- `docker-compose.yml` — standard compose config. Maps port 8080 and mounts the repo as a volume.
- `docker-compose-slim.yml` — smaller image variant.
- `bin/entry_point.sh` — container entry point script.

### Usage

```bash
docker compose pull && docker compose up        # First run
docker compose up --build                        # After Dockerfile changes
docker compose down                              # Stop
```

The prebuilt image `amirpourmand/al-folio:v0.16.3` is used by default.

## Prettier

[Prettier](https://prettier.io/) is the project's code formatter. It is mandatory for all PRs.

### Configuration (`.prettierrc`)

```json
{
  "plugins": ["@shopify/prettier-plugin-liquid"],
  "printWidth": 150,
  "trailingComma": "es5"
}
```

### Dependencies (`package.json`)

```json
{
  "devDependencies": {
    "@shopify/prettier-plugin-liquid": "^1.10.0",
    "prettier": "^3.8.0"
  }
}
```

### Usage

```bash
npm install --save-dev prettier @shopify/prettier-plugin-liquid
npx prettier . --write    # Format all files
npx prettier . --check    # Verify formatting
```

Files in `_scripts/` are excluded (`.prettierignore`) because `.liquid.js` files mix Liquid and JavaScript syntax.

## PurgeCSS

[PurgeCSS](https://purgecss.com/) removes unused CSS from production builds. Configuration is in `purgecss.config.js`:

```javascript
module.exports = {
  content: ["_site/**/*.html", "_site/**/*.js"],
  css: ["_site/assets/css/*.css"],
  output: "_site/assets/css/",
  skippedContentGlobs: ["_site/assets/**/*.html"],
};
```

PurgeCSS runs automatically during the CI deploy workflow after Jekyll builds the site.

## Pre-commit hooks

`.pre-commit-config.yaml` defines hooks that run before each commit:

| Hook | Purpose |
|------|---------|
| `trailing-whitespace` | Removes trailing whitespace |
| `end-of-file-fixer` | Ensures files end with a newline |
| `check-yaml` | Validates YAML syntax |
| `check-added-large-files` | Prevents accidental large file commits |

Install with:

```bash
pip install pre-commit
pre-commit install
```

## CI workflows (`.github/workflows/`)

### `deploy.yml` — Build and deploy

- Triggers on push/PR to `main` (excluding docs-only changes).
- Sets up Ruby 3.3.5, Python 3.13, ImageMagick, nbconvert.
- Runs `bundle exec jekyll build` with `JEKYLL_ENV=production`.
- Runs PurgeCSS.
- Deploys to `gh-pages` branch on push to `main`.

### `prettier.yml` — Formatting check

- Runs Prettier on all files.
- Fails the PR if code is not formatted.
- Generates an HTML diff artifact on failure.

### `broken-links.yml` / `broken-links-site.yml` — Link validation

- Scans for broken internal and external links.

### `axe.yml` — Accessibility

- Runs axe-core checks against the built site.

### `codeql.yml` — Security scanning

- GitHub CodeQL analysis for security vulnerabilities.

### `update-citations.yml` — Citation updates

- Automatically updates citation counts.

### `render-cv.yml` — CV rendering

- Generates CV PDF from `_data/cv.yml` using RenderCV.

## Node.js

Node.js is used solely for Prettier and PurgeCSS. There is no frontend JavaScript build pipeline — scripts in `_scripts/` are processed by Jekyll's Liquid engine directly.

## Python

Python 3.13 is used for `nbconvert` (Jupyter notebook conversion). Installed in the Docker image automatically.

## Ruby / Bundler

Ruby 3.3.5 with Bundler manages Jekyll and its gem dependencies. `Gemfile` and `Gemfile.lock` define the exact dependency set.

## Related pages

- [Development Workflow](development-workflow.md) — Docker setup and formatting workflow
- [Testing](testing.md) — local verification and CI checks
- [Patterns and Conventions](patterns-and-conventions.md) — coding standards by file type
- [How to Contribute](index.md) — PR process and commit conventions
