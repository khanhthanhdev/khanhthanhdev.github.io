# Theming and Styling

The site uses a modular SCSS architecture with CSS custom properties to support light/dark mode switching. All visual styling is controlled through SCSS variables and theme overrides.

## SCSS File Organization

The `_sass/` directory contains the following files:

| File                 | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `_variables.scss`    | Base color palette, spacing, and configuration variables    |
| `_themes.scss`       | CSS custom property definitions for light and dark themes   |
| `_base.scss`         | Base element styles (typography, tables, blockquotes, etc.) |
| `_layout.scss`       | Page container, profile, and content layout rules           |
| `_navbar.scss`       | Navigation bar, dropdowns, and mobile hamburger menu        |
| `_footer.scss`       | Fixed and sticky footer styles                              |
| `_blog.scss`         | Blog post headers, post lists, pagination, tags             |
| `_publications.scss` | Publication entry layout and badge styles                   |
| `_components.scss`   | Reusable component styles                                   |
| `_cv.scss`           | CV page specific styles                                     |
| `_tabs.scss`         | Tab component styles                                        |
| `_teachings.scss`    | Course/teaching page styles                                 |
| `_utilities.scss`    | Utility classes                                             |
| `_typography.scss`   | Font and text sizing                                        |
| `_toc-sidebar.scss`  | Sidebar table of contents styles                            |
| `_distill.scss`      | Distill-style article formatting                            |
| `_typograms.scss`    | Typogram diagram styles                                     |

SCSS is compiled with `sass: compressed` output style (configured in `_config.yml`).

## Color Variables

Base colors are defined in `_sass/_variables.scss`:

```scss
$red-color: #ff3636;
$blue-color: #0076df;
$cyan-color: #2698ba;
$green-color: #00ab37;
$purple-color: #b509ac;
$pink-color: #f92080;
$yellow-color: #efcc00;

$grey-color: #828282;
$grey-color-light: /* auto-adjusted lighter */;
$grey-color-dark: #1c1c1d;
$grey-900: #212529;

$white-color: #ffffff;
$black-color: #000000;

$code-bg-color-light: rgba($purple-color, 0.05);
$code-bg-color-dark: #2c3237;
```

All colors use `!default` flags, so you can override them by defining values before the import.

## Light and Dark Themes

Theme-specific CSS custom properties are defined in `_sass/_themes.scss`. The `:root` selector sets light-mode defaults, and `html[data-theme="dark"]` overrides them for dark mode.

**Key custom properties:**

| Property                    | Light Mode        | Dark Mode        |
| --------------------------- | ----------------- | ---------------- |
| `--global-bg-color`         | `#ffffff`         | `#1c1c1d`        |
| `--global-text-color`       | `#000000`         | `#c7c7c7`        |
| `--global-text-color-light` | `#828282`         | `#828282`        |
| `--global-theme-color`      | `#4d74eb`         | `#2698ba` (cyan) |
| `--global-hover-color`      | `#4d74eb`         | `#2698ba`        |
| `--global-footer-bg-color`  | `#1c1c1d`         | `#c7c7c7`        |
| `--global-divider-color`    | `rgba(0,0,0,0.1)` | `#424246`        |
| `--global-card-bg-color`    | `#ffffff`         | `#212529`        |
| `--global-code-bg-color`    | light purple tint | `#2c3237`        |

All component styles reference these custom properties rather than hardcoded colors, so the entire site responds to theme changes.

## Dark Mode Toggle

Dark mode is enabled in `_config.yml`:

```yaml
enable_darkmode: true
```

The toggle button (`#light-toggle`) in the navbar cycles through three states:

1. **System** — Respects the user's OS preference (`prefers-color-scheme`). Displays a half-sun/moon icon.
2. **Dark** — Forces dark mode. Displays a moon icon.
3. **Light** — Forces light mode. Displays a sun icon.

The selected preference is persisted in `localStorage` under the `theme` key. The `html` element's `data-theme` and `data-theme-setting` attributes control which styles apply.

## Responsive Design

The site is responsive by default:

- **Container max-width:** Set via `$max-content-width` (default `930px`) in `_variables.scss`, applied in `_layout.scss`.
- **Navbar:** Collapses to a hamburger menu on small screens. Controlled by Bootstrap's responsive breakpoints in `_navbar.scss`.
- **Images:** Use the `{% include figure.liquid %}` include with `class="img-fluid"` for responsive sizing.
- **WebP conversion:** When `imagemagick.enabled: true`, images in `assets/img/` are automatically converted to responsive WebP variants at configured widths (480, 800, 1400px).
- **Lazy loading:** Enabled by default (`lazy_loading_images: true`).

## Customizing Colors

To change the site's color scheme:

1. **Override SCSS variables:** Create or edit `_sass/_variables.scss` and define your values before the defaults:

   ```scss
   $cyan-color: #your-color;
   $blue-color: #your-color;
   ```

2. **Override CSS custom properties:** Add a `_sass/_custom.scss` file (or use `_layouts/default.liquid` with a `<style>` block) to redefine theme properties:

   ```scss
   :root {
     --global-theme-color: #your-brand-color;
     --global-hover-color: #your-brand-color;
   }
   html[data-theme="dark"] {
     --global-theme-color: #your-dark-brand-color;
   }
   ```

3. **GitHub readme stats theme:** Configure `repo_theme_light` and `repo_theme_dark` in `_config.yml` to change the color scheme of GitHub stats widgets.

## Tip/Warning/Danger Blocks

Blockquotes can be styled as callout blocks using CSS classes:

```markdown
{: .block-tip }

> **Tip:** Helpful information.

{: .block-warning }

> **Warning:** Potential issues.

{: .block-danger }

> **Danger:** Destructive actions.
```

Each block type has its own color variables for background, text, and title in both light and dark modes.

## Related Pages

- [Content Collections](content-collections.md) — How layouts map to collections
- [Blog](blog.md) — Blog-specific styling
- [Publications](publications.md) — Publication badge and layout styles
