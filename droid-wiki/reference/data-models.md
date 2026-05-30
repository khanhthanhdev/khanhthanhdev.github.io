# Data Models

All site data files live in `_data/`. This page documents the schema of each YAML file with field descriptions and examples.

---

## socials.yml

Defines social media links displayed in the navbar and on the about page. Managed by the `jekyll-socials` plugin.

**File:** `_data/socials.yml`

| Field               | Type   | Required | Description                                                  |
| ------------------- | ------ | -------- | ------------------------------------------------------------ |
| `email`             | string | Yes      | Author's email address.                                      |
| `github_username`   | string | No       | GitHub username (renders a link to `github.com/{username}`). |
| `scholar_userid`    | string | No       | Google Scholar user ID (renders a link to the profile).      |
| `linkedin_username` | string | No       | LinkedIn username.                                           |
| `x_username`        | string | No       | X (formerly Twitter) username.                               |

Additional social platforms are supported by the `jekyll-socials` plugin. See the [plugin documentation](https://github.com/george-gca/jekyll-socials) for the full list of supported keys.

**Example:**

```yaml
email: user@example.com
github_username: octocat
scholar_userid: ABCDEF12345
linkedin_username: octocat
x_username: octocat
```

---

## cv.yml

Defines the full curriculum vitae data rendered on the CV page. The top-level key is `cv`, containing personal information and a `sections` map where each key is a CV section.

**File:** `_data/cv.yml`

### Root fields

| Field                | Type   | Required | Description                                      |
| -------------------- | ------ | -------- | ------------------------------------------------ |
| `cv.name`            | string | Yes      | Full name.                                       |
| `cv.label`           | string | No       | Professional title or label (e.g., "Scientist"). |
| `cv.email`           | string | No       | Contact email.                                   |
| `cv.location`        | string | No       | Location (e.g., "Princeton, NJ").                |
| `cv.image`           | string | No       | Path to a profile image.                         |
| `cv.summary`         | string | No       | Short professional summary.                      |
| `cv.social_networks` | array  | No       | List of social network objects (see below).      |
| `cv.address`         | object | No       | Mailing address (see below).                     |
| `cv.sections`        | object | Yes      | Map of section names to arrays of entries.       |

### social_networks entry

| Field      | Type   | Description                                     |
| ---------- | ------ | ----------------------------------------------- |
| `network`  | string | Network name (e.g., `X`, `GitHub`, `LinkedIn`). |
| `username` | string | Username on that network.                       |

### address

| Field         | Type   | Description       |
| ------------- | ------ | ----------------- |
| `street`      | string | Street address.   |
| `city`        | string | City.             |
| `region`      | string | State or region.  |
| `postalCode`  | string | Postal/ZIP code.  |
| `countryCode` | string | ISO country code. |

### Sections

The `sections` object maps section names to arrays of entries. Standard section names include:

#### Education

| Field         | Type             | Description                        |
| ------------- | ---------------- | ---------------------------------- |
| `institution` | string           | University or school name.         |
| `location`    | string           | City, country.                     |
| `url`         | string           | Institution website URL.           |
| `area`        | string           | Field of study.                    |
| `studyType`   | string           | Degree type (e.g., PhD, Master's). |
| `start_date`  | string           | Start year.                        |
| `end_date`    | string           | End year.                          |
| `score`       | string           | GPA or grade.                      |
| `courses`     | string           | Notable courses.                   |
| `highlights`  | array of strings | Bullet points.                     |

#### Experience

| Field        | Type             | Description                     |
| ------------ | ---------------- | ------------------------------- |
| `company`    | string           | Employer or organization name.  |
| `position`   | string           | Job title.                      |
| `location`   | string           | Work location.                  |
| `start_date` | string           | Start date (year or `YYYY-MM`). |
| `end_date`   | string           | End date.                       |
| `summary`    | string           | Role description.               |
| `highlights` | array of strings | Bullet points.                  |

#### Volunteer

| Field        | Type             | Description        |
| ------------ | ---------------- | ------------------ |
| `company`    | string           | Organization name. |
| `position`   | string           | Volunteer role.    |
| `location`   | string           | Location.          |
| `start_date` | string           | Start date.        |
| `end_date`   | string           | End date.          |
| `summary`    | string           | Description.       |
| `highlights` | array of strings | Bullet points.     |

#### Awards

| Field     | Type             | Description               |
| --------- | ---------------- | ------------------------- |
| `title`   | string           | Award name.               |
| `authors` | array of strings | Awarding body or authors. |
| `date`    | string           | Date received.            |
| `awarder` | string           | Awarding organization.    |
| `url`     | string           | Link to award details.    |
| `summary` | string           | Description.              |

#### Publications

| Field         | Type             | Description              |
| ------------- | ---------------- | ------------------------ |
| `title`       | string           | Publication title.       |
| `authors`     | array of strings | Author names.            |
| `publisher`   | string           | Journal or publisher.    |
| `releaseDate` | string           | Publication date.        |
| `url`         | string           | Link to publication.     |
| `summary`     | string           | Abstract or description. |

#### Skills

| Field      | Type   | Description                     |
| ---------- | ------ | ------------------------------- |
| `name`     | string | Skill category name.            |
| `level`    | string | Proficiency level.              |
| `icon`     | string | Font Awesome icon class.        |
| `keywords` | string | Comma-separated skill keywords. |

#### Languages

| Field     | Type   | Description              |
| --------- | ------ | ------------------------ |
| `name`    | string | Language name.           |
| `summary` | string | Proficiency description. |

#### Interests

| Field      | Type   | Description               |
| ---------- | ------ | ------------------------- |
| `name`     | string | Interest area name.       |
| `icon`     | string | Font Awesome icon class.  |
| `keywords` | string | Comma-separated keywords. |

#### Certificates

| Field    | Type   | Description              |
| -------- | ------ | ------------------------ |
| `name`   | string | Certificate name.        |
| `date`   | string | Date obtained.           |
| `issuer` | string | Issuing organization.    |
| `icon`   | string | Font Awesome icon class. |

#### Projects

| Field        | Type             | Description          |
| ------------ | ---------------- | -------------------- |
| `name`       | string           | Project name.        |
| `summary`    | string           | Project description. |
| `highlights` | array of strings | Key achievements.    |
| `start_date` | string           | Start date.          |
| `end_date`   | string           | End date.            |

#### References

| Field       | Type   | Description              |
| ----------- | ------ | ------------------------ |
| `name`      | string | Reference person's name. |
| `icon`      | string | Font Awesome icon class. |
| `reference` | string | Testimonial text.        |

---

## coauthors.yml

Maps co-author last names to their metadata for linking in bibliography entries. Each key is a lowercase last name.

**File:** `_data/coauthors.yml`

### Entry schema

| Field                    | Type             | Description                                                |
| ------------------------ | ---------------- | ---------------------------------------------------------- |
| `{lastname}`             | array            | Array of co-author objects with that last name.            |
| `{lastname}[].firstname` | array of strings | All known first name variants (full name, initials, etc.). |
| `{lastname}[].url`       | string           | Link to the co-author's profile or Wikipedia page.         |

**Example:**

```yaml
"einstein":
  - firstname: ["Albert", "A.", "A. E."]
    url: https://en.wikipedia.org/wiki/Albert_Einstein

"bach":
  - firstname: ["Johann Sebastian", "J. S."]
    url: https://en.wikipedia.org/wiki/Johann_Sebastian_Bach

  - firstname: ["Carl Philipp Emanuel", "C. P. E."]
    url: https://en.wikipedia.org/wiki/Carl_Philipp_Emanuel_Bach
```

Note: The same last name can have multiple entries (different people), as shown with `bach` above.

---

## repositories.yml

Configures which GitHub repositories and users are displayed on the Repositories page.

**File:** `_data/repositories.yml`

| Field                        | Type             | Description                                             |
| ---------------------------- | ---------------- | ------------------------------------------------------- |
| `github_users`               | array of strings | GitHub usernames whose pinned repos are displayed.      |
| `repo_description_lines_max` | integer          | Maximum lines of description shown per repo card.       |
| `github_repos`               | array of strings | Specific repositories to display (`owner/repo` format). |

**Example:**

```yaml
github_users:
  - torvalds
  - alshedivat

repo_description_lines_max: 2

github_repos:
  - alshedivat/al-folio
  - jekyll/jekyll
  - twbs/bootstrap
```

---

## venues.yml

Defines publication venue metadata for use in bibliography entries. Each key is a venue abbreviation.

**File:** `_data/venues.yml`

| Field            | Type   | Description                                           |
| ---------------- | ------ | ----------------------------------------------------- |
| `{abbrev}`       | object | Venue entry keyed by abbreviation.                    |
| `{abbrev}.url`   | string | _(optional)_ URL to the venue's website.              |
| `{abbrev}.color` | string | _(optional)_ Hex color code for styling venue badges. |

**Example:**

```yaml
"AJP":
  url: https://aapt.scitation.org/journal/ajp
  color: "#00369f"

"PhysRev":
  url: https://journals.aps.org/

"Vision":
  color: "#009f36"
```

---

## citations.yml

Auto-generated file containing Google Scholar citation data. Updated automatically by the `update-citations.yml` GitHub Actions workflow (runs Monday, Wednesday, Friday). Not intended for manual editing.

**File:** `_data/citations.yml`

### Top-level structure

| Field                   | Type   | Description                                       |
| ----------------------- | ------ | ------------------------------------------------- |
| `metadata.last_updated` | string | ISO date of last update (e.g., `2026-02-25`).     |
| `papers`                | object | Map of Google Scholar paper IDs to citation data. |

### Paper entry

| Field                  | Type    | Description                      |
| ---------------------- | ------- | -------------------------------- |
| `{paper_id}`           | object  | Paper entry keyed by Scholar ID. |
| `{paper_id}.citations` | integer | Total citation count.            |
| `{paper_id}.title`     | string  | Paper title.                     |
| `{paper_id}.year`      | string  | Publication year.                |

**Example:**

```yaml
metadata:
  last_updated: "2026-02-25"
papers:
  qc6CJjYAAAAJ:-Viv1fr_sjoC:
    citations: 137
    title: The special theory of relativity
    year: "1905"
```

---

## Related pages

- [Configuration](configuration.md) — How these data files are referenced in `_config.yml`
- [Dependencies](dependencies.md) — Plugins that process these data files
- [Overview](../overview/index.md) — Repository structure
