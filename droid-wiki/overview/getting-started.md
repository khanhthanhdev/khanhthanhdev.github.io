# Getting started

## Prerequisites

- **Docker** and **Docker Compose** (recommended for local development)
- Alternatively: Ruby 3.3.5+, Python 3.13+, Node.js, ImageMagick, and `nbconvert`

## Local development with Docker

```bash
# Clone the repository
git clone https://github.com/khanhthanhdev/khanhthanhdev.github.io.git
cd khanhthanhdev.github.io

# Pull the prebuilt image and start the dev server
docker compose pull && docker compose up
```

The site will be available at `http://localhost:8080`. Changes to source files trigger automatic rebuilds via Jekyll's `--watch` flag and livereload.

To rebuild after changing dependencies or the Dockerfile:

```bash
docker compose up --build
```

To stop the server and free port 8080:

```bash
docker compose down
```

## Local development without Docker

```bash
# Install Ruby dependencies
bundle install

# Install Python dependencies (for Jupyter notebook support)
pip3 install --upgrade nbconvert

# Start the dev server
bundle exec jekyll serve --port 8080
```

## Pre-commit checklist

Before every commit:

1. **Format code with Prettier:**

```bash
npm install --save-dev prettier @shopify/prettier-plugin-liquid
npx prettier . --write
```

2. **Build locally and verify:**

```bash
docker compose up --build
# Visit http://localhost:8080
# Check navigation, pages, images, and dark mode toggle
```

## Key commands

| Task                      | Command                                          |
| ------------------------- | ------------------------------------------------ |
| Start dev server (Docker) | `docker compose up`                              |
| Rebuild with updated deps | `docker compose up --build`                      |
| Stop server               | `docker compose down`                            |
| Format all files          | `npx prettier . --write`                         |
| Build only (no serve)     | `bundle exec jekyll build`                       |
| Build for production      | `JEKYLL_ENV=production bundle exec jekyll build` |

## Configuration

All site settings live in `_config.yml`. The most important fields to update when personalizing:

- `title`, `first_name`, `middle_name`, `last_name` — your name
- `url` — your site URL (e.g., `https://username.github.io`)
- `baseurl` — leave empty for personal sites, set to `/repo-name/` for project sites
- `description` — site description for SEO
- `icon` — emoji favicon or image path

Social links are configured in `_data/socials.yml`. CV data lives in `_data/cv.yml`.

See [Configuration](../reference/configuration.md) for the full reference.
