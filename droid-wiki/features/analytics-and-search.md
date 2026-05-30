# Analytics and Search

The site supports multiple analytics providers with optional GDPR-compliant cookie consent, plus a client-side search feature for pages, posts, and bibliography entries.

## Analytics Providers

All analytics are configured in `_config.yml` under the "Analytics and search engine verification" section. Each provider has a corresponding enable flag and an ID field.

### Google Analytics

Google Analytics 4 (GA4) is supported via the global site tag (gtag.js).

```yaml
enable_google_analytics: true
google_analytics: G-XXXXXXXXXX
```

Setup script: `_scripts/google-analytics-setup.js`

When cookie consent is enabled, the gtag script is loaded with `type="text/plain" data-category="analytics"` so it is blocked until the user grants consent. Google Consent Mode is initialized in the cookie consent script with `analytics_storage: denied` as the default.

### Cronitor

Cronitor Real User Monitoring (RUM) analytics:

```yaml
enable_cronitor_analytics: true
cronitor_analytics: XXXXXXXXX
```

Setup script: `_scripts/cronitor-analytics-setup.js`

### Pirsch

Pirsch is a privacy-friendly analytics service:

```yaml
enable_pirsch_analytics: true
pirsch_analytics: <32-character-site-id>
```

The Pirsch script is loaded directly from `https://api.pirsch.io/pa.js` with the `data-code` attribute set to the site ID. No additional setup script is needed.

### Openpanel

Openpanel analytics:

```yaml
enable_openpanel_analytics: true
openpanel_analytics: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
```

Setup script: `_scripts/open-panel-analytics-setup.js`

The setup script initializes Openpanel with screen view tracking, outgoing link tracking, and attribute tracking enabled.

### Search Engine Verification

Google and Bing site verification for search console:

```yaml
enable_google_verification: true
google_site_verification: your-verification-id
enable_bing_verification: true
bing_site_verification: your-verification-id
```

## Cookie Consent

A GDPR-compliant cookie consent dialog is available using the [vanilla-cookieconsent](https://cookieconsent.orestbida.com/) library:

```yaml
enable_cookie_consent: true
```

Configuration script: `_scripts/cookie-consent-setup.js`

### How It Works

1. **Script blocking:** All analytics scripts are loaded with `type="text/plain" data-category="analytics"` instead of `type="text/javascript"`. The cookie consent library intercepts these and blocks them until consent is granted.

2. **Google Consent Mode:** Before any analytics load, the script initializes Google Consent Mode with all storage types set to `denied`. This ensures Google services operate in a privacy-preserving mode even before the user interacts with the consent dialog.

3. **Consent categories:**
   - **Necessary** — Always enabled, read-only. Covers essential site functionality.
   - **Analytics** — Opt-in. Covers all analytics providers (Google, Cronitor, Pirsch, Openpanel).

4. **Consent callback:** When the user accepts or rejects analytics, the script updates Google Consent Mode via `gtag('consent', 'update', ...)` and the cookie consent library automatically enables or disables the blocked scripts.

5. **Persistence:** The user's consent choice is stored in a cookie and respected on subsequent visits.

### Supported Providers with Cookie Consent

| Provider         | Script Type                                   | Blocked Until Consent |
| ---------------- | --------------------------------------------- | --------------------- |
| Google Analytics | `type="text/plain" data-category="analytics"` | Yes                   |
| Cronitor RUM     | `type="text/plain" data-category="analytics"` | Yes                   |
| Pirsch           | `type="text/plain" data-category="analytics"` | Yes                   |
| Openpanel        | `type="text/plain" data-category="analytics"` | Yes                   |

## Search

The site includes a client-side search feature powered by [ninja-keys](https://github.com/ssleptsov/ninja-keys), a command-palette style search component.

### Configuration

```yaml
search_enabled: true
socials_in_search: true # include social links in results
posts_in_search: true # include blog posts in results
bib_search: true # include bibliography entries in results
```

### How It Works

1. **Search data generation:** `_scripts/search.liquid.js` generates a JavaScript data file (`/assets/js/search-data.js`) at build time. It iterates over all pages, posts, and bibliography entries, extracting titles, descriptions, and content.

2. **Search UI:** The ninja-keys component provides a keyboard-driven command palette. Users can trigger it via a button in the navbar or a keyboard shortcut.

3. **Search scope:**
   - **Navigation pages** — All pages with `nav: true` in frontmatter
   - **Dropdown items** — Child pages in dropdown menus
   - **Blog posts** — All posts (when `posts_in_search: true`)
   - **Bibliography** — Publication entries (when `bib_search: true`)
   - **Social links** — Social media profiles (when `socials_in_search: true`)

4. **Search scripts:**
   - `_scripts/search.liquid.js` — Generates search data from site content
   - `_includes/scripts.liquid` — Loads the ninja-keys component and search setup

### Search Script Loading

From `_includes/scripts.liquid`:

```liquid
{% if site.search_enabled %}
  <script type="module" src="{{ '/assets/js/search/ninja-keys.min.js' | relative_url }}"></script>
  <ninja-keys hideBreadcrumbs noAutoLoadMdIcons placeholder="Type to start searching"></ninja-keys>
  <script src="{{ '/assets/js/search-setup.js' | relative_url }}"></script>
  <script src="{{ '/assets/js/search-data.js' | relative_url }}"></script>
  <script src="{{ '/assets/js/shortcut-key.js' | relative_url }}"></script>
{% endif %}
```

## Site Verification

For Google Search Console and Bing Webmaster Tools:

```yaml
enable_google_verification: true
google_site_verification: your-id
enable_bing_verification: true
bing_site_verification: your-id
```

Verification meta tags are injected into the HTML head by `_includes/head.liquid`.

## Related Pages

- [Blog](blog.md) — Posts included in search results
- [Publications](publications.md) — Bibliography entries included in search results
- [Theming and Styling](theming-and-styling.md) — Dark mode interaction with analytics consent UI
