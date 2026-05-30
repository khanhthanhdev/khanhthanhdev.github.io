# Publications

The publications system uses [Jekyll Scholar](https://github.com/inukshuk/jekyll-scholar) to render BibTeX entries from `_bibliography/papers.bib` through a custom Liquid layout. It supports citation badges, thumbnail previews, expandable abstracts, and links to supplementary materials.

## BibTeX Configuration

The Scholar plugin is configured in `_config.yml`:

```yaml
scholar:
  last_name: [Einstein]
  first_name: [Albert, A.]
  style: apa
  locale: en
  source: /_bibliography/
  bibliography: papers.bib
  bibliography_template: bib
  bibtex_filters: [latex, smallcaps, superscript]
  replace_strings: true
  join_strings: true
  details_dir: bibliography
  details_link: Details
  query: "@*"
  group_by: year
  group_order: descending
```

Key settings:

- **`last_name` / `first_name`** — Used to identify the site owner's publications. The owner's name is rendered in _italics_ in the author list.
- **`bibliography_template: bib`** — Points to `_layouts/bib.liquid` for rendering each entry.
- **`group_by: year`** — Groups publications by year in descending order.

## BibTeX Entry Format

Entries in `_bibliography/papers.bib` use standard BibTeX types (`@article`, `@book`, `@inproceedings`, etc.) extended with custom fields for the theme.

**Example entry:**

```bibtex
@article{PhysRev.47.777,
  abbr              = {PhysRev},
  title             = {Can Quantum-Mechanical Description...},
  author            = {Einstein*†, A. and Podolsky*, B. and Rosen*, N.},
  abstract          = {In a complete theory there is an element...},
  journal           = {Phys. Rev.},
  volume            = {47},
  issue             = {10},
  pages             = {777--780},
  year              = {1935},
  doi               = {10.1103/PhysRev.47.777},
  html              = {https://journals.aps.org/pr/abstract/...},
  pdf               = {example_pdf.pdf},
  altmetric         = {248277},
  dimensions        = {true},
  google_scholar_id = {qyhmnyLat1gC},
  inspirehep_id     = {3255},
  video             = {https://www.youtube-nocookie.com/embed/...},
  selected          = {true},
  bibtex_show       = {true},
  award             = {Albert Einstein received the **Nobel Prize**...},
  award_name        = {Nobel Prize}
}
```

## Custom Keywords

These keywords are filtered from the BibTeX output but control rendering behavior:

| Keyword             | Description                                                               |
| ------------------- | ------------------------------------------------------------------------- |
| `abbr`              | Abbreviated venue name shown as a badge (can link via `_data/venues.yml`) |
| `abstract`          | Full abstract text; shown in an expandable "Abs" button                   |
| `altmetric`         | Altmetric ID for citation badge                                           |
| `annotation`        | Popover annotation shown next to author names                             |
| `arxiv`             | arXiv ID; generates an "arXiv" button                                     |
| `award`             | Award description; shown in an expandable "Awarded" button                |
| `award_name`        | Label for the award button (defaults to "Awarded")                        |
| `bibtex_show`       | Show a "Bib" button that expands to the raw BibTeX                        |
| `blog`              | URL to a blog post about this paper                                       |
| `code`              | URL to source code                                                        |
| `dimensions`        | Dimensions badge (`true` for DOI-based, or a specific ID)                 |
| `doi`               | DOI string; generates a "DOI" button linking to doi.org                   |
| `google_scholar_id` | Google Scholar citation ID for the badge                                  |
| `hal`               | HAL identifier; generates an "HAL" button                                 |
| `html`              | URL to HTML version (local path or full URL)                              |
| `inspirehep_id`     | InspireHEP record ID for citation badge                                   |
| `pdf`               | PDF file name (looked up in `/assets/pdf/`) or full URL                   |
| `pmid`              | PubMed ID for Altmetric/Dimensions badges                                 |
| `poster`            | Poster PDF path or URL                                                    |
| `preview`           | Thumbnail image (looked up in `/assets/img/publication_preview/`)         |
| `selected`          | Marks entry for the "selected papers" page                                |
| `slides`            | Slides PDF path or URL                                                    |
| `supp`              | Supplementary material PDF path or URL                                    |
| `video`             | Video URL; embedded if `enable_video_embedding: true`                     |
| `website`           | Project website URL                                                       |

These keywords are listed in `filtered_bibtex_keywords` in `_config.yml` so they are stripped from the displayed BibTeX output.

## Citation Badges

Badge display is controlled by `enable_publication_badges` in `_config.yml`:

```yaml
enable_publication_badges:
  altmetric: true
  dimensions: true
  google_scholar: true
  inspirehep: true
```

### Altmetric

Uses the Altmetric embed script. Supports lookup by `altmetric` ID, `arxiv`/`eprint` ID, `doi`, `pmid`, or `isbn`. Displays a donut-style badge with a popover showing citation details.

### Dimensions

Uses the Dimensions badge script. Supports lookup by `dimensions` ID, `doi`, or `pmid`. Displays a small rectangle badge.

### Google Scholar

Renders a shields.io badge showing the citation count. The count is fetched at build time by `_plugins/google-scholar-citations.rb`, which scrapes Google Scholar pages. Citation data is cached in `site.data.citations` to avoid repeated requests.

### InspireHEP

Renders a shields.io badge showing the citation count from InspireHEP. The count is fetched at build time by `_plugins/inspirehep-citations.rb`, which queries the InspireHEP API (`https://inspirehep.net/api/literature/`).

## Author Handling

- The site owner's name (matched via `scholar.last_name` and `scholar.first_name`) is rendered in _italics_.
- Co-author names can be linked to their websites via `_data/coauthors.yml`.
- Superscript symbols in author names (e.g., `*`, `†`, `‡`) are automatically rendered as `<sup>` elements.
- `max_author_limit` (default `3`) controls how many authors are shown before collapsing into a clickable "N more authors" span.

## Thumbnails

When `enable_publication_thumbnails: true`, the `preview` field displays a thumbnail image in the left column. Images are loaded from `/assets/img/publication_preview/`. External URLs (containing `://`) are used directly.

## Venue Abbreviations

The `abbr` field can reference entries in `_data/venues.yml` to display colored badges with links:

```yaml
# _data/venues.yml
PhysRev:
  url: https://journals.aps.org/pr/
  color: "#4d74eb"
```

## Adding a New Publication

1. Add a BibTeX entry to `_bibliography/papers.bib`.
2. Set `bibtex_show: true` to display the BibTeX toggle.
3. Optionally add `pdf`, `code`, `slides`, `video`, `poster`, `preview`, and badge IDs.
4. Place PDF files in `/assets/pdf/` and preview images in `/assets/img/publication_preview/`.
5. Build and verify: `docker compose up --build`.

## Related Pages

- [Theming and Styling](theming-and-styling.md) — Publication layout SCSS
- [Content Collections](content-collections.md) — How publications relate to other collections
- [Analytics and Search](analytics-and-search.md) — Bibliography search (`bib_search: true`)
