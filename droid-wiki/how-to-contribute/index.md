# How to Contribute

This guide covers the contribution workflow for the al-folio academic website template. Whether you are fixing a typo, adding a feature, or improving documentation, follow these conventions to keep the project healthy.

## Prerequisites

Before contributing, make sure you have:

- Git installed and configured
- Docker (recommended) or Ruby 3.3.5 + Bundler for local builds
- Node.js and npm (for Prettier formatting)

## Pull request process

1. **Open an issue first** for new features or non-trivial bug fixes. Minor fixes (typos, docs) can go straight to a PR.
2. **Fork and clone** the repository, then create a feature branch from `main`.
3. **Make your changes** following the conventions in [Development Workflow](development-workflow.md).
4. **Format your code** with Prettier before committing (see [Testing](testing.md)).
5. **Test locally** with Docker to verify the site builds and renders correctly.
6. **Open a PR** against `main`. Reference the issue it addresses (e.g., `Fixes #123`).

## Commit message format

All commit messages follow a conventional type prefix:

```
<type>: <subject>

<body (optional)>
```

| Type | Purpose |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, whitespace (no logic change) |
| `config` | Configuration file changes |
| `chore` | Build process, tooling, dependency updates |

**Examples:**

```
feat: Add dark mode toggle button to header
fix: Correct baseurl in project site configuration
docs: Update INSTALL.md with Docker troubleshooting
style: Format all Liquid templates with Prettier
config: Enable blog section in _config.yml
chore: Update Jekyll dependencies with bundle update --all
```

## What NOT to commit

Always respect the `.gitignore` file. Never commit:

- Build outputs (`_site/`, `.jekyll-cache/`)
- Dependencies (`node_modules/`, `vendor/`)
- OS-specific files (`.DS_store`)
- Editor temporary files (`.idea/`, `.swp`, `.swo`)
- Secrets, API keys, or credentials

## Staging changes

Always `git add` files explicitly. Do not use `git add .` unless you are certain of every file being staged. Run `git status` first.

## Issues

Use GitHub issues for bugs and feature requests:

1. Read the [FAQ](https://github.com/alshedivat/al-folio/blob/main/FAQ.md) first.
2. Check for duplicates in [existing issues](https://github.com/alshedivat/al-folio/issues).
3. Use the appropriate issue template.
4. For questions (not bugs), use [Discussions](https://github.com/alshedivat/al-folio/discussions).

## License

By contributing, you agree your contributions are licensed under the project's LICENSE file.

## Related pages

- [Development Workflow](development-workflow.md) — branch, code, test, PR, merge cycle
- [Testing](testing.md) — local verification and CI checks
- [Patterns and Conventions](patterns-and-conventions.md) — coding standards by file type
- [Tooling](tooling.md) — build system, Prettier, Docker, CI workflows
