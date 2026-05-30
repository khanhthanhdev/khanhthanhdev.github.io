# Development Workflow

This page covers the full cycle: branch, code, test, PR, merge. It assumes you have read [How to Contribute](index.md) for commit conventions and PR expectations.

## Branching strategy

All work happens on feature branches off `main`. The `gh-pages` branch is reserved for the deployed site — never push to it directly.

```
main          ← PRs merge here
└── feat/my-feature   ← your branch
```

Name branches with a short prefix: `feat/`, `fix/`, `docs/`, `chore/`.

## Docker-based local development

Docker is the recommended approach. It ensures consistency with CI/CD and avoids Ruby/Python environment issues on your machine.

### Initial setup

```bash
docker compose pull         # Pull the prebuilt image (amirpourmand/al-folio:v0.16.3)
docker compose up           # Start the dev server
# Site runs at http://localhost:8080
```

### Rebuilding after dependency or config changes

```bash
docker compose up --build           # Rebuilds the Docker image from Dockerfile
docker compose up --force-recreate  # Forces a complete container rebuild
```

### Slim image (smaller download)

```bash
docker compose -f docker-compose-slim.yml up
```

### Stopping

```bash
docker compose down
```

## Formatting with Prettier

Prettier is mandatory for all PRs. The CI workflow (`prettier.yml`) will fail if code is not properly formatted.

### Install (first time only)

```bash
npm install --save-dev prettier @shopify/prettier-plugin-liquid
```

### Format before every commit

```bash
npx prettier . --write
```

### Check without writing

```bash
npx prettier . --check
```

The Prettier configuration lives in `.prettierrc`:

```json
{
  "plugins": ["@shopify/prettier-plugin-liquid"],
  "printWidth": 150,
  "trailingComma": "es5"
}
```

> **Note:** Files in `_scripts/` are excluded from Prettier (see `.prettierignore`) because `.liquid.js` files mix Liquid and JavaScript syntax.

## Build verification

Before pushing, verify the site builds and renders:

```bash
docker compose up --build
# Wait 30–60 seconds for Jekyll to build
# Open http://localhost:8080
# Check navigation, pages, images, dark mode
# Exit with Ctrl+C
```

For a full CI-equivalent build:

```bash
docker compose up
bundle exec jekyll build
# Check for errors in output
```

## Committing

See [How to Contribute](index.md) for the full commit message format. In short:

```bash
git add <specific-files>
git commit -m "feat: Add dark mode toggle button to header"
```

Never `git add .` blindly. Always review `git status` first.

## Opening a PR

1. Push your branch: `git push -u origin feat/my-feature`
2. Open a PR against `main`.
3. Reference the issue it addresses.
4. CI will run: Prettier check, deploy build, broken links, axe accessibility, CodeQL.
5. Wait for all checks to pass before requesting review.

## Merge

Once checks pass and the PR is approved:

- Squash merge (preferred) or regular merge into `main`.
- Delete the feature branch after merge.
- GitHub Actions will automatically deploy to GitHub Pages.

## Pre-commit hooks (optional)

The repository includes a `.pre-commit-config.yaml` with hooks for:

- Trailing whitespace removal
- End-of-file fixer
- YAML syntax check
- Large file check

Install pre-commit:

```bash
pip install pre-commit
pre-commit install
```

## Related pages

- [How to Contribute](index.md) — PR process and commit conventions
- [Testing](testing.md) — local verification and CI checks
- [Tooling](tooling.md) — build system, Docker, CI workflows
- [Debugging](debugging.md) — common errors and troubleshooting
