# Patterns and Conventions

This page summarizes the coding conventions for each file type in the repository. Detailed instructions live in `.github/instructions/` for each type.

## Liquid templates (`.liquid`)

**Files:** `_includes/*.liquid`, `_layouts/*.liquid`

- Use `{% include filename.liquid %}` to import reusable components.
- Common tags: `{% for %}`, `{% if %}`, `{% assign %}`, `{% capture %}`.
- Output variables with `{{ variable }}`.
- Key includes: `header.liquid`, `footer.liquid`, `head.liquid`, `scripts.liquid`, `citation.liquid`.
- Layouts are specified in frontmatter: `layout: page`.
- Prettier with `@shopify/prettier-plugin-liquid` enforces formatting (2-space indent, consistent spacing).
- Always test with `docker compose up` after modifying templates.

## YAML configuration (`_config.yml`, `_data/*.yml`)

**Files:** `_config.yml`, `_data/socials.yml`, `_data/cv.yml`, `_data/coauthors.yml`, etc.

- `url` and `baseurl` must be set together — personal sites leave `baseurl` empty.
- Feature flags use the pattern `feature_name: enabled: true/false`.
- Quote strings containing special characters: `title: "My: Cool Site"`.
- Use 2-space indentation, never tabs.
- Social links in `_data/socials.yml` are displayed in definition order.
- Co-author mappings in `_data/coauthors.yml` link BibTeX names to profile URLs.
- CV content uses RenderCV format in `_data/cv.yml`.
- Always validate by running `docker compose up` after changes.

## BibTeX (`.bib`)

**Files:** `_bibliography/papers.bib`

- Standard BibTeX types: `@article`, `@inproceedings`, `@book`, etc.
- al-folio custom keywords: `abstract`, `award`, `code`, `doi`, `html`, `pdf`, `poster`, `preview`, `selected`, `slides`.
- Protect capitalization in titles with curly braces: `title={{D}eep {L}earning}`.
- PDF filenames resolve to `assets/pdf/` automatically. Preview images resolve to `assets/img/publication_preview/`.
- Keep entries alphabetically sorted by key.
- Each entry must have a unique citation key.

## Markdown content

**Files:** `_posts/*.md`, `_pages/*.md`, `_projects/*.md`, `_news/*.md`, `_books/*.md`, `_teachings/*.md`

- Every file requires YAML frontmatter with `layout`, `title`, and type-specific fields.
- Blog post filenames: `YYYY-MM-DD-title.md`. Date must not be in the future.
- Project `importance` field (integer) controls display order — higher = featured first.
- Use `{% include figure.liquid %}` for responsive images with captions.
- Math: inline `$E = mc^2$`, display `$$\int_0^1 f(x) dx$$`.
- Date format: ISO 8601 (`YYYY-MM-DD`).

## JavaScript (`.js`, `.liquid.js`)

**Files:** `_scripts/*.js`, `_scripts/*.liquid.js`

- `.liquid.js` files are processed by Jekyll's Liquid engine before output — they mix Liquid tags with JavaScript.
- Use `permalink:` frontmatter to set the output path (e.g., `permalink: /assets/js/search-data.js`).
- ES6 imports reference libraries via `site.third_party_libraries` from `_config.yml`.
- **Do NOT run Prettier on `_scripts/`** — these files are excluded in `.prettierignore` because Prettier cannot handle Liquid+JS hybrids.
- Follow existing code style manually (indentation, spacing, quotes).
- Third-party library URLs come from `_config.yml`, not hardcoded.

## General formatting rules

- **Prettier** is the project formatter. Run `npx prettier . --write` before every commit.
- `.prettierrc` settings: 150 character print width, ES5 trailing commas, Liquid plugin enabled.
- `.pre-commit-config.yaml` provides hooks for trailing whitespace, end-of-file, YAML validation, and large file checks.
- SCSS lives in `_sass/` and follows standard Sass conventions.

## Related pages

- [How to Contribute](index.md) — PR process and commit conventions
- [Development Workflow](development-workflow.md) — formatting and build verification
- [Tooling](tooling.md) — Prettier, PurgeCSS, Docker, CI workflows
- [Testing](testing.md) — local verification and CI checks
