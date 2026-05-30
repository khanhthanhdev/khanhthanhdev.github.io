# Overview

This repository is a personal academic website for Tran Khanh Thanh, built on the [al-folio](https://github.com/alshedivat/al-folio) Jekyll theme. It is hosted on GitHub Pages at `khanhthanhdev.github.io`.

The site showcases an academic portfolio including a profile page, publications bibliography, blog posts, project listings, course/teaching pages, book reviews, and a CV. It uses Jekyll 4.x with Ruby, Liquid templates, SCSS for styling, and deploys via GitHub Actions.

## Key facts

| Field      | Value                                                    |
| ---------- | -------------------------------------------------------- |
| Base theme | al-folio (Jekyll academic theme)                         |
| Owner      | Tran Khanh Thanh                                         |
| Host       | GitHub Pages                                             |
| URL        | https://khanhthanhdev.github.io                          |
| Tech stack | Jekyll 4.x, Ruby 3.3.5, Liquid, SCSS, Node.js (Prettier) |
| Deployment | GitHub Actions (`deploy.yml`) to `gh-pages` branch       |
| Local dev  | Docker (`docker compose up`) on port 8080                |

## Repository structure

```
.
├── _config.yml           # Primary site configuration
├── _data/                # YAML data files (socials, CV, citations, etc.)
├── _includes/            # Reusable Liquid template components
├── _layouts/             # Page layout templates
├── _pages/               # Static pages (about, blog, CV, publications, etc.)
├── _posts/               # Blog posts
├── _projects/            # Project showcase entries
├── _news/                # News/announcement entries
├── _books/               # Book review entries
├── _teachings/           # Course/teaching entries
├── _bibliography/        # BibTeX files for publications
├── _sass/                # SCSS stylesheets
├── _scripts/             # JavaScript files
├── _plugins/             # Custom Jekyll plugins (Ruby)
├── assets/               # Static assets (images, fonts, JS libraries, etc.)
├── bin/                  # Build and deployment scripts
├── .github/              # GitHub Actions workflows and agent configs
├── Dockerfile            # Docker image definition
├── docker-compose.yml    # Docker Compose for local development
├── Gemfile               # Ruby dependencies
└── package.json          # Node.js dependencies (Prettier)
```

## Related pages

- [Architecture](architecture.md) — how the Jekyll build pipeline and template system fit together
- [Getting started](getting-started.md) — prerequisites, installation, and local development
- [Glossary](glossary.md) — project-specific terms
- [Content collections](../features/content-collections.md) — how blog posts, projects, news, and other collections work
- [Theming and styling](../features/theming-and-styling.md) — SCSS structure and dark mode
- [Publications](../features/publications.md) — bibliography and citation management
