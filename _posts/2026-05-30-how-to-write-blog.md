---
layout: post
title: how to write a blog post
date: 2026-05-30 00:00:00
published: false
description: a comprehensive guide to writing blog posts on this site
tags: guide blog
categories: guide
featured: true
toc:
  sidebar: true
---

This guide covers everything you need to know about writing blog posts on this site.

## Getting Started

### Creating a New Post

Create a new file in the `_posts/` directory with the format:

```
YYYY-MM-DD-title-with-hyphens.md
```

For example: `2026-05-30-my-first-post.md`

### Front Matter

Every post starts with YAML front matter between `---` delimiters:

```yml
---
layout: post
title: your post title
date: 2026-05-30 12:00:00
description: a brief description for previews
tags: [tag1, tag2]
categories: [category1]
---
```

#### Common Front Matter Options

| Option            | Description                            |
| ----------------- | -------------------------------------- |
| `layout`          | Always use `post` for blog posts       |
| `title`           | The post title                         |
| `date`            | Publication date (YYYY-MM-DD HH:MM:SS) |
| `description`     | Short description for previews         |
| `tags`            | Array or space-separated tags          |
| `categories`      | Array or space-separated categories    |
| `featured`        | Set `true` to pin to top of blog       |
| `redirect`        | URL to redirect to instead of content  |
| `toc`             | Table of contents settings             |
| `giscus_comments` | Enable comments (default: true)        |
| `related_posts`   | Show related posts (default: true)     |
| `thumbnail`       | Path to thumbnail image                |
| `last_updated`    | Date of last update                    |

## Writing Content

### Basic Formatting

Standard Markdown formatting works:

```markdown
**bold text** and _italic text_

[link text](https://example.com)

> Blockquote text

- Unordered list item
- Another item

1. Ordered list item
2. Another item
```

### Headings

```markdown
## Heading 2

### Heading 3

#### Heading 4
```

### Code Blocks

Inline code: `code here`

Fenced code blocks with syntax highlighting:

````markdown
```python
def hello():
    print("Hello, World!")
```
````

For line numbers, use the Liquid tag:

{% raw %}

```liquid
{% highlight python linenos %}
def hello(): print("Hello, World!")
{% endhighlight %}
```

{% endraw %}

### Math Equations

Inline math: `$$ E = mc^2 $$`

Display math:

```markdown
$$
\sum_{k=1}^\infty |\langle x, e_k \rangle|^2 \leq \|x\|^2
$$
```

Numbered equations:

```markdown
\begin{equation}
\label{eq:cauchy-schwarz}
\left( \sum*{k=1}^n a_k b_k \right)^2 \leq \left( \sum*{k=1}^n a*k^2 \right) \left( \sum*{k=1}^n b_k^2 \right)
\end{equation}
```

## Media

### Images

Basic image using the include:

{% raw %}

```liquid
{% include figure.liquid loading="eager" path="assets/img/photo.jpg" class="img-fluid rounded z-depth-1" %}
```

{% endraw %}

Zoomable image:

{% raw %}

```liquid
{% include figure.liquid path="assets/img/photo.jpg" class="img-fluid rounded z-depth-1" zoomable=true %}
```

{% endraw %}

Image gallery with columns:

{% raw %}

```html
<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">{% include figure.liquid path="assets/img/1.jpg" class="img-fluid rounded z-depth-1" %}</div>
  <div class="col-sm mt-3 mt-md-0">{% include figure.liquid path="assets/img/2.jpg" class="img-fluid rounded z-depth-1" %}</div>
</div>
<div class="caption">Caption text goes here</div>
```

{% endraw %}

### Videos

Local video:

{% raw %}

```liquid
{% include video.liquid path="assets/video/video.mp4" class="img-fluid rounded z-depth-1" controls=true %}
```

{% endraw %}

Embedded YouTube:

{% raw %}

```liquid
{% include video.liquid path="https://www.youtube.com/embed/VIDEO_ID" class="img-fluid rounded z-depth-1" %}
```

{% endraw %}

## Tables

### Simple Markdown Tables

Add to front matter:

```yml
pretty_table: true
```

Then use standard markdown:

```markdown
| Column 1 | Column 2 | Column 3 |
| :------- | :------: | -------: |
| Left     |  Center  |    Right |
```

### Advanced Tables

For pagination, search, and sorting, use Bootstrap Table with JSON data:

{% raw %}

```html
<table data-toggle="table" data-url="{{ '/assets/json/data.json' | relative_url }}" data-pagination="true" data-search="true">
  <thead>
    <tr>
      <th data-field="id" data-sortable="true">ID</th>
      <th data-field="name" data-sortable="true">Name</th>
    </tr>
  </thead>
</table>
```

{% endraw %}

## Table of Contents

There are two TOC options available:

### Inline TOC (at beginning of content)

Add to front matter:

```yml
toc:
  beginning: true
```

This auto-generates a TOC at the beginning of your post from your headings.

### Sidebar TOC (persistent navigation)

For long posts, a sidebar TOC stays visible while scrolling:

```yml
# Left sidebar (default)
toc:
  sidebar: true

# Right sidebar
toc:
  sidebar: right
```

**Note:** When sidebar TOC is enabled, the inline TOC is automatically disabled.

## Special Features

### Redirect Posts

Redirect to an external URL or file:

```yml
---
layout: post
title: download paper
redirect: /assets/pdf/paper.pdf
---
```

### Jupyter Notebooks

Include a Jupyter notebook:

{% raw %}

```liquid
{::nomarkdown}
{% assign jupyter_path = 'assets/jupyter/notebook.ipynb' | relative_url %}
{% capture notebook_exists %}{% file_exists assets/jupyter/notebook.ipynb %}{% endcapture %}
{% if notebook_exists == 'true' %}
  {% jupyter_notebook jupyter_path %}
{% else %}
  <p>Notebook not found.</p>
{% endif %}
{:/nomarkdown}
```

{% endraw %}

### Comments

Comments are enabled by default via Giscus. To disable:

```yml
giscus_comments: false
```

### Related Posts

Related posts are shown by default. To disable:

```yml
related_posts: false
```

### Thumbnail Images

Add a thumbnail for the blog listing:

```yml
thumbnail: assets/img/thumbnail.jpg
```

## Example Post Template

```markdown
---
layout: post
title: my awesome post
date: 2026-05-30 12:00:00
description: what this post is about
tags: [topic1, topic2]
categories: [research]
thumbnail: assets/img/thumbnail.jpg
toc:
  sidebar: true
---

## Introduction

Your introduction here...

## Methods

Your methods here...

## Results

Your results here...

## Conclusion

Your conclusion here...
```

## Tips

1. Use descriptive titles with lowercase
2. Add tags for better organization
3. Include a description for previews
4. Use thumbnails for visual appeal
5. Enable TOC for long posts
6. Keep dates in consistent format

Happy blogging!
