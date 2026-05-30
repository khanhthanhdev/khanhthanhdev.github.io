# Debugging

This page covers common errors encountered during local development and deployment, with step-by-step fixes.

## YAML syntax errors

### Symptom

Build fails with `YAML parse error` or a Liquid error pointing to `_config.yml`.

### Cause

Special characters (`:`, `&`, `#`, `|`, `>`) in unquoted YAML string values.

### Fix

```yaml
# Wrong
title: My Site: Research & Teaching

# Right
title: "My Site: Research & Teaching"
```

Other common mistakes:

- Inconsistent indentation (must be 2 spaces, no tabs).
- Missing closing quotes or braces.
- Deleting `baseurl:` instead of leaving it empty.

### Debug

```bash
bundle exec jekyll build 2>&1 | head -30
# Or use an online validator: https://www.yamllint.com/
```

## CSS / JS not loading

### Symptom

Site loads but has no styling, broken layout, or missing JavaScript functionality.

### Cause

Incorrect `url` and `baseurl` in `_config.yml`.

### Fix

For a personal/organization site:

```yaml
url: https://username.github.io
baseurl: # Leave empty, do not delete the line
```

For a project site:

```yaml
url: https://username.github.io
baseurl: /repository-name/
```

Then clear browser cache (`Ctrl+Shift+R` or open an incognito window) and redeploy.

## Port conflicts

### Symptom

`Address already in use` when starting the dev server.

### Fix — Docker

```bash
docker compose down
docker compose up
```

### Fix — Ruby

```bash
lsof -i :4000 | grep LISTEN | awk '{print $2}' | xargs kill
# Or use a different port:
bundle exec jekyll serve --port 5000
```

## Docker build failures

### Symptom

`docker compose up` fails or exits with errors.

### Checklist

1. Update the image: `docker compose pull`.
2. Rebuild: `docker compose up --build`.
3. Check disk space and available RAM.
4. For M1/M2 Macs: update Docker Desktop.
5. Linux: ensure your user is in the docker group — `sudo usermod -aG docker $USER` (then log out and back in).

## Plugin errors

### "Unknown tag 'toc'" on GitHub Actions

Local build works but CI fails.

**Fix:**

1. Go to repo Settings → Pages → Source.
2. Set it to `Deploy from a branch`.
3. Ensure the branch is `gh-pages`, not `main`.
4. Wait a few minutes and re-run the workflow.

### "Zero vectors cannot be normalized"

Related posts feature crashes.

**Cause:** Empty blog posts or posts with only stop words confuse `classifier-reborn`.

**Fix:** Add meaningful content to the post, or disable related posts in the post frontmatter:

```yaml
related_posts: false
```

## Prettier formatting failures

### Symptom

PR fails the `prettier.yml` CI check even though local builds passed.

### Fix

```bash
npm install --save-dev prettier @shopify/prettier-plugin-liquid
npx prettier . --write
git add .
git commit -m "style: Format code with prettier"
```

## Blog posts not appearing

### Checklist

- Filename format: `YYYY-MM-DD-title.md` (hyphens, no spaces).
- File is in `_posts/`, not a subdirectory.
- Required frontmatter: `layout: post`, `title`, `date`.
- Date is not in the future (Jekyll skips future-dated posts by default).
- Blog is enabled: `blog.enabled: true` in `_config.yml`.

## Publications not displaying

### Checklist

- File is at `_bibliography/papers.bib`.
- BibTeX syntax is correct (no missing commas, unmatched braces).
- Entry has a unique citation key.
- Publications page is enabled in `_config.yml`.

### Debug

```bash
docker compose run --rm web jekyll build 2>&1 | grep -i bibtex
```

## Images not loading

### Causes

- Wrong path in Markdown (use relative paths from repo root).
- File doesn't exist at the specified location.
- Case sensitivity matters on Linux/macOS.

### Correct format

```markdown
![Alt text](assets/img/image-name.jpg)
```

For BibTeX PDF links, use just the filename:

```bibtex
pdf={my-paper.pdf}  # Resolves to assets/pdf/my-paper.pdf
```

## Search not working

1. Enable in `_config.yml`: `search_enabled: true`.
2. Ensure `_config.yml` has a valid `url`.
3. Rebuild the site. The search index is generated during build.

## Getting help

- Check [TROUBLESHOOTING.md](https://github.com/alshedivat/al-folio/blob/main/TROUBLESHOOTING.md) in the repo root.
- Search [GitHub Issues](https://github.com/alshedivat/al-folio/issues).
- Ask in [Discussions](https://github.com/alshedivat/al-folio/discussions).

## Related pages

- [Testing](testing.md) — local verification and CI checks
- [Development Workflow](development-workflow.md) — Docker setup and build verification
- [How to Contribute](index.md) — PR process and commit conventions
