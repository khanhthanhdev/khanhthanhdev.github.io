# Testing

This page covers how to test changes locally and understand the CI checks that run on every PR.

## Local testing with Docker

Docker is the recommended way to test. It mirrors the CI environment and avoids local Ruby/Python issues.

### Build and run

```bash
docker compose pull && docker compose up
# Site runs at http://localhost:8080
```

### What to verify

After the build completes (wait 30–60 seconds):

1. **Navigation** — all menu links work.
2. **Pages** — about, CV, publications, blog, projects render correctly.
3. **Images** — profile photo, project thumbnails, publication previews load.
4. **Dark mode** — toggle works and styles apply.
5. **Responsive layout** — check at mobile and desktop widths.
6. **Console** — open browser DevTools, confirm no JS errors or 404s.

### Rebuild after changes

```bash
docker compose up --build
```

### Legacy: Ruby directly

If you cannot use Docker:

```bash
bundle install
pip install jupyter
bundle exec jekyll serve --port 4000
# Visit http://localhost:4000
```

> ImageMagick must be installed on the host for image processing. Ubuntu/Debian: `sudo apt-get install imagemagick`. macOS: `brew install imagemagick`.

## Prettier check

Prettier formatting is mandatory. CI will fail if code is not formatted.

```bash
npm install --save-dev prettier @shopify/prettier-plugin-liquid
npx prettier . --write    # Format everything
npx prettier . --check    # Verify (no changes needed)
```

## CI checks on every PR

The following GitHub Actions workflows run automatically:

### `prettier.yml` — Code formatting

- Runs Prettier on all files.
- Fails the PR if formatting is off.
- On failure, downloads the HTML diff artifact to see exactly what changed.

### `deploy.yml` — Build and deploy

- Sets up Ruby 3.3.5, Python 3.13, ImageMagick, nbconvert.
- Runs `bundle exec jekyll build` with `JEKYLL_ENV=production`.
- Runs PurgeCSS for CSS optimization.
- Commits the built site to `gh-pages` (on `main` pushes only).

### `broken-links.yml` / `broken-links-site.yml` — Link validation

- Scans for broken internal and external links.
- Fix any broken links before merging.

### `axe.yml` — Accessibility

- Runs axe-core accessibility checks against the built site.
- Catches missing alt text, color contrast issues, ARIA problems.

### `codeql.yml` — Security scanning

- GitHub CodeQL analysis for security vulnerabilities.
- Runs on push and PR events.

### Other workflows

- `update-citations.yml` — automatically updates citation counts.
- `render-cv.yml` — generates CV PDF from `_data/cv.yml`.

## Checking specific features

### Publications

```bash
docker compose up
# Visit http://localhost:8080/publications/
# Verify entries from _bibliography/papers.bib render correctly
```

### Blog posts

```bash
# Visit http://localhost:8080/blog/
# Verify post appears with correct date, categories, and content
```

### Search

```bash
# Visit http://localhost:8080
# Use the search bar (ninja-keys) to find pages and posts
```

## Debugging build errors

If `docker compose up` shows errors:

```bash
docker compose up 2>&1 | grep -i error
```

Common issues:

- **YAML parse error** — check `_config.yml` for unquoted special characters. See [Debugging](debugging.md).
- **Unknown tag** — a Liquid tag in a template is misspelled or a plugin is missing.
- **BibTeX error** — check `_bibliography/papers.bib` for unclosed braces.

## Related pages

- [Development Workflow](development-workflow.md) — the full branch-code-test-PR cycle
- [Debugging](debugging.md) — common errors and fixes
- [Tooling](tooling.md) — CI workflows and build tools
- [How to Contribute](index.md) — PR process and commit conventions
