# Prioritized SEO Action Plan: khanhthanhdev.github.io

This action plan lists issues sequenced by impact and effort, complete with verification steps.

## Critical Priority

No issues detected in this priority level.

## High Priority

No issues detected in this priority level.

## Medium Priority

### Thin content detected on 7 pages (Content Quality)

- **Recommendation:** 7 pages have fewer than 200 words. Sample: https://khanhthanhdev.github.io/blog/ (112 words)
- **Why it matters:** Search engines prioritize comprehensive content that satisfies user queries.
- **Dependency:** None
- **Verification (Falsifiability):** Expand content or add noindex to very thin placeholder pages.
- **Leading Indicator:** Decrease bounce rates on thin pages after expansion.

### Missing entity schema (Organization or Person) (Schema)

- **Recommendation:** Found general schema types, but missing Person or Organization schema to map entities.
- **Why it matters:** Search engines build knowledge graphs by connecting Person and Organization entities.
- **Dependency:** None
- **Verification (Falsifiability):** Add JSON-LD for Organization and Person to homepage/about pages.
- **Leading Indicator:** Verify entity validation in GSC rich results reports.

### Missing alt attributes on 22 images (Images)

- **Recommendation:** 22 images do not have an alt description attribute. Sample: https://khanhthanhdev.github.io/assets/img/projects/aikc/homepage.png on page https://khanhthanhdev.github.io/projects/2026-06-02-ai-knowledge-cloud/
- **Why it matters:** Alt attributes are necessary for accessibility and image search indexation.
- **Dependency:** None
- **Verification (Falsifiability):** Add alt attributes to images in markdown or HTML source.
- **Leading Indicator:** Increase organic impressions in Google Images search.

## Low Priority

### Missing llms.txt at root (AI Search Readiness)

- **Recommendation:** An llms.txt file was not found. While not currently a Google ranking signal, it is increasingly used by LLM scrapers.
- **Why it matters:** llms.txt provides clean markdown context specifically optimized for LLMs.
- **Dependency:** None
- **Verification (Falsifiability):** Create an llms.txt file at the root. Verify by accessing /llms.txt.
- **Leading Indicator:** Correct citability by LLM crawlers.
