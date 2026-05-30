# Content Collections

Jekyll collections are groups of related content that share a common structure. This site defines several collections in `_config.yml`, each with its own directory, frontmatter schema, and output behavior.

## Collections Reference

| Collection   | Directory       | Layout           | Output | Description                              |
| ------------ | --------------- | ---------------- | ------ | ---------------------------------------- |
| `posts`      | `_posts/`       | `post`           | yes    | Blog posts (built-in Jekyll collection)  |
| `projects`   | `_projects/`    | `page`           | yes    | Portfolio project cards                  |
| `news`       | `_news/`        | `post` (default) | yes    | Announcements displayed on the homepage  |
| `books`      | `_books/`       | `book-review`    | yes    | Book reviews with ratings and metadata   |
| `teachings`  | `_teachings/`   | `course`         | yes    | Course pages with weekly schedules       |

The collection configuration in `_config.yml`:

```yaml
collections:
  books:
    output: true
  news:
    defaults:
      layout: post
    output: true
  projects:
    output: true
  teachings:
    output: true
```

## Posts (Blog)

See [Blog](blog.md) for full details. Files live in `_posts/` and follow the naming convention `YYYY-MM-DD-title.md`.

**Frontmatter example:**

```yaml
---
layout: post
title: my post title
date: 2026-05-30 12:00:00
description: a brief description
tags: [tag1, tag2]
categories: [category1]
---
```

## Projects

Project files in `_projects/` use the `page` layout and render as project cards on the projects page. Cards are arranged in a masonry grid when `enable_masonry: true` is set.

**Frontmatter example** (from `_projects/chess-engine.md`):

```yaml
---
layout: page
title: Chess Engine
description: A basic chess engine with minimax and alpha-beta pruning.
importance: 4
date: 2024-12-05
category: fun
---
```

Key fields:
- **`importance`** — Controls sort order on the projects page (higher = shown first).
- **`category`** — Groups projects into filterable categories when `enable_project_categories: true`.
- **`redirect`** — Optionally redirect to an external URL instead of rendering content.

## News

News items in `_news/` are displayed as announcements on the homepage. Two styles are supported:

**Inline announcement** (short, no title):

```yaml
---
layout: post
date: 2015-10-22 15:59:00-0400
inline: true
related_posts: false
---
A simple inline announcement.
```

**Full announcement** (with title and body):

```yaml
---
layout: post
title: A long announcement with details
date: 2015-11-07 16:11:00-0400
inline: false
related_posts: false
---
Full markdown content here...
```

Configuration in `_config.yml`:

```yaml
announcements:
  enabled: true
  scrollable: true  # adds scroll bar if more than 3 items
  limit: 5          # max items shown (blank = all)
```

## Books

Book review files in `_books/` use the `book-review` layout. They support cover images, Open Library IDs, ISBN lookups, ratings, and reading status tracking.

**Frontmatter example** (from `_books/the_godfather.md`):

```yaml
---
layout: book-review
title: The Godfather
author: Mario Puzo
cover: assets/img/book_covers/the_godfather.jpg
olid: OL43499941M
isbn: 7539967447
categories: classics crime historical-fiction mystery novels thriller
tags: top-100
buy_link: https://www.amazon.com/...
date: 2024-08-23
started: 2024-08-23
finished: 2024-09-07
released: 1969
stars: 5
goodreads_review: 6318556633
status: Finished
---
```

Key fields:
- **`cover`** — Path to a local cover image. If omitted, the theme fetches one from Open Library using `olid` or `isbn`.
- **`stars`** — Rating from 1 to 5.
- **`status`** — Reading status (e.g., `Finished`, `Reading`, `To Read`).
- **`categories`** / **`tags`** — Used for archive filtering via `jekyll-archives`.

## Teachings

Course files in `_teachings/` use the `course` layout and render a structured weekly schedule with linked materials.

**Frontmatter example** (from `_teachings/data-science-fundamentals.md`):

```yaml
---
layout: course
title: Data Science Fundamentals
description: Foundational aspects of data science...
instructor: Prof. Data
year: 2024
term: Spring
location: Science Building, Room 202
time: Mondays and Wednesdays, 2:00-3:30 PM
course_id: data-science-fundamentals
schedule:
  - week: 1
    date: Feb 5
    topic: Introduction to Data Science
    description: Overview of the data science workflow.
    materials:
      - name: Syllabus
        url: /assets/pdf/example_pdf.pdf
      - name: Slides
        url: /assets/pdf/example_pdf.pdf
  # ... more weeks
---
```

Key fields:
- **`schedule`** — Array of weekly entries, each with `week`, `date`, `topic`, `description`, and `materials`.
- **`materials`** — Array of `{name, url}` objects linking to lecture slides, assignments, etc.

## Adding a New Entry

1. Create a new `.md` file in the appropriate collection directory.
2. Add the required frontmatter fields (see examples above).
3. Write the content body in Markdown below the frontmatter.
4. Build and verify locally: `docker compose up --build`.

## Related Pages

- [Blog](blog.md) — Detailed blog post format and features
- [Theming and Styling](theming-and-styling.md) — How layouts relate to SCSS
- [Publications](publications.md) — Bibliography collection via Jekyll Scholar
