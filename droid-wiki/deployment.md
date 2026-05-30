# Deployment

This page covers how the site is built, deployed, and published. The repository uses GitHub Pages for hosting, GitHub Actions for CI/CD, and Docker for local development and image distribution.

---

## GitHub Pages deployment

### Primary workflow (`deploy.yml`)

**File:** `.github/workflows/deploy.yml`

The main deployment workflow builds the site and pushes the output to the `gh-pages` branch.

**Triggers:**

| Event | Branches | Condition |
|-------|----------|-----------|
| `push` | `master`, `main` | Changes to content files (assets, sass, scripts, bib, html, js, liquid, markdown, yml, Gemfile) |
| `pull_request` | `master`, `main` | Same file changes (build only, no deploy) |
| `workflow_dispatch` | — | Manual trigger |

**Build steps:**

1. **Checkout** — Checks out the repository.
2. **Setup Ruby** — Installs Ruby 3.3.5 with Bundler caching.
3. **Setup Python** — Installs Python 3.13 with pip caching.
4. **Update `_config.yml`** — Sets `giscus.repo` to the current GitHub repository name.
5. **Install and Build** — Installs ImageMagick, upgrades nbconvert, runs `bundle exec jekyll build` with `JEKYLL_ENV=production`.
6. **Purge unused CSS** — Runs PurgeCSS with `purgecss.config.js` to remove unused CSS.
7. **Deploy** — Uses `JamesIves/github-pages-deploy-action@v4` to push `_site/` to the `gh-pages` branch (skipped for pull requests).

**Permissions:** `contents: write` (required to push to `gh-pages`).

---

## Docker image publishing

### Tag-based workflow (`deploy-docker-tag.yml`)

**File:** `.github/workflows/deploy-docker-tag.yml`

Publishes a versioned Docker image when a Git tag matching `v*` is pushed.

**Triggers:** Push of tags matching `v*`, when Docker-related files change (`Dockerfile`, `Gemfile`, `Gemfile.lock`, `package.json`, `package-lock.json`, `bin/entry_point.sh`).

**Build steps:**

1. **Checkout** — Checks out the repository.
2. **Set up QEMU** — Enables multi-platform builds.
3. **Set up Buildx** — Configures Docker Buildx for advanced builds.
4. **Docker meta** — Extracts tag metadata for image labels and tags.
5. **Login** — Authenticates to Docker Hub using `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets.
6. **Build and push** — Builds for `linux/amd64` and `linux/arm64/v8` platforms and pushes to `amirpourmand/al-folio`.

**Image:** `amirpourmand/al-folio:{version}` (e.g., `amirpourmand/al-folio:v0.16.3`).

### Main branch workflow (`deploy-image.yml`)

**File:** `.github/workflows/deploy-image.yml`

Publishes the `latest` Docker image on every push to `master`/`main` that changes Docker-related files.

**Condition:** Only runs for the `alshedivat` repository owner (upstream).

**Image:** `amirpourmand/al-folio:latest`

### Slim image workflow (`docker-slim.yml`)

**File:** `.github/workflows/docker-slim.yml`

Creates a size-optimized "slim" variant of the Docker image using [DockerSlim](https://github.com/docker-slim/docker-slim).

**Triggers:**

| Event | Condition |
|-------|-----------|
| `push` to `master`/`main` | When `docker-slim.yml` changes |
| `workflow_run` | After the "Docker Image CI" workflow succeeds |
| `workflow_dispatch` | Manual trigger |

**Build steps:**

1. Checks out the repository.
2. Logs in to Docker Hub.
3. Updates `docker-compose.yml` to use the workspace path.
4. Runs DockerSlim to create a minimized image tagged as `amirpourmand/al-folio:slim`.
5. Pushes the slim image to Docker Hub.

**Condition:** Only runs for the `alshedivat` repository owner and when the parent Docker Image CI workflow succeeded.

---

## Docker local development

### Dockerfile

**File:** `Dockerfile`

Based on `ruby:slim`, the image includes:

- **System packages:** build-essential, curl, git, ImageMagick, inotify-tools, locales, Node.js, procps, python3-pip, zlib1g-dev.
- **Python packages:** nbconvert (for Jupyter notebook conversion).
- **Ruby packages:** Jekyll and all gems from `Gemfile`.
- **Exposed port:** 8080.
- **Entry point:** `/tmp/entry_point.sh`.

**Environment variables set in the image:**

| Variable | Value | Purpose |
|----------|-------|---------|
| `EXECJS_RUNTIME` | `Node` | JavaScript runtime for ExecJS. |
| `JEKYLL_ENV` | `production` | Jekyll environment. |
| `LANG` | `en_US.UTF-8` | System locale. |
| `LANGUAGE` | `en_US:en` | Language preference. |
| `LC_ALL` | `en_US.UTF-8` | Locale override. |

### docker-compose.yml

**File:** `docker-compose.yml`

| Setting | Value | Description |
|---------|-------|-------------|
| `image` | `amirpourmand/al-folio:v0.16.3` | Pre-built image from Docker Hub. |
| `build` | `.` | Falls back to building from Dockerfile if image pull fails. |
| `ports` | `8080:8080`, `35729:35729` | Jekyll server (8080) and LiveReload (35729). |
| `volumes` | `.:/srv/jekyll` | Mounts the repository into the container for live editing. |
| `environment` | `JEKYLL_ENV=development` | Enables development mode features. |

### docker-compose-slim.yml

**File:** `docker-compose-slim.yml`

Same as `docker-compose.yml` but uses the `amirpourmand/al-folio:slim` image (smaller size, no build fallback).

### Entry point script (`bin/entry_point.sh`)

**File:** `bin/entry_point.sh`

The container entry point does the following:

1. **Manages `Gemfile.lock`** — If tracked by Git, restores it; if untracked, removes it to avoid conflicts.
2. **Starts Jekyll** — Runs `bundle exec jekyll serve` with:
   - `--watch` — Rebuilds on file changes.
   - `--port=8080` — Serves on port 8080.
   - `--host=0.0.0.0` — Binds to all interfaces.
   - `--livereload` — Enables LiveReload on port 35729.
   - `--verbose --trace` — Detailed output for debugging.
   - `--force_polling` — Uses polling instead of inotify (needed for mounted volumes).
3. **Watches `_config.yml`** — Uses `inotifywait` to detect changes to `_config.yml` and restarts Jekyll when it changes (since config changes require a full restart).

---

## Manual deployment script (`bin/deploy`)

**File:** `bin/deploy`

A shell script for manually deploying to GitHub Pages without GitHub Actions.

**Usage:**

```bash
bin/deploy [-s SRC_BRANCH] [-d DEPLOY_BRANCH] [--verbose] [--no-push]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-s`, `--src` | `main` | Source branch to build from. |
| `-d`, `--deploy` | `gh-pages` | Target branch for deployment. |
| `--verbose` | — | Enable shell tracing (`set -x`). |
| `--no-push` | — | Build but don't push to remote. |

**Process:**

1. Validates no uncommitted or untracked changes exist.
2. Checks out the source branch.
3. Creates a fresh `gh-pages` branch (deletes existing one).
4. Runs `JEKYLL_ENV=production bundle exec jekyll build`.
5. Runs PurgeCSS.
6. Moves `_site/` contents to the repo root, removing everything else.
7. Creates a `.nojekyll` file (bypasses GitHub Pages' built-in Jekyll processing).
8. Commits and force-pushes to the deploy branch.
9. Switches back to the source branch.

---

## Related CI/CD workflows

Additional workflows run alongside deployment:

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| Update citations | `update-citations.yml` | Mon/Wed/Fri schedule + manual | Fetches Google Scholar citation counts and updates `_data/citations.yml`. |
| Render CV | `render-cv.yml` | Push to `_data/cv.yml` or RenderCV config + manual | Renders the CV from YAML to PDF using RenderCV. |
| Prettier | `prettier.yml` | Push/PR | Formats code with Prettier. |
| CodeQL | `codeql.yml` | Push/PR + schedule | Security analysis of the codebase. |
| Broken links | `broken-links.yml` / `broken-links-site.yml` | Schedule + manual | Checks for broken internal and external links. |
| Lighthouse | `lighthouse-badger.yml` | Schedule + manual | Runs Lighthouse performance/accessibility audits. |
| Axe | `axe.yml` | Schedule + manual | Accessibility testing with axe-core. |

---

## Quick reference

### Local development

```bash
docker compose pull && docker compose up
# Site at http://localhost:8080, LiveReload at http://localhost:35729
```

### Production build (local)

```bash
JEKYLL_ENV=production bundle exec jekyll build
purgecss -c purgecss.config.js
# Output in _site/
```

### Manual deploy

```bash
bin/deploy                    # Deploy main → gh-pages
bin/deploy --no-push          # Build only, don't push
bin/deploy -s develop -d staging  # Custom branches
```

---

## Related pages

- [Overview](overview/index.md) — Repository structure and key facts
- [Configuration](reference/configuration.md) — All `_config.yml` settings
- [Dependencies](reference/dependencies.md) — Ruby gems and Node.js packages
