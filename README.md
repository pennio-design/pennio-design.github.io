# PENNIO website

Static website for PENNIO, published through GitHub Pages on the custom domain
[https://pennio.agency/](https://pennio.agency/).

## Architecture

- **Hosting:** GitHub Pages
- **Publishing source:** repository configuration must be confirmed in GitHub Pages settings
- **Build:** Jekyll, configured in `_config.yml`
- **Frontend:** static HTML, CSS and browser JavaScript
- **Dependencies:** no root `package.json` or npm build pipeline
- **Domain:** `CNAME` contains `pennio.agency`
- **SEO files:** `robots.txt`, `sitemap.xml`, page-level canonical and social metadata

## Public page routes

| Route | Source | Purpose |
|---|---|---|
| `/` | `index.html` | Main PENNIO website |
| `/audit/` | `audit/index.html` | Brand Check |
| `/review/` | `review/index.html` | Brand Review service |
| `/letscreate/` | `letscreate/index.html` | Let's Create community |
| `/oju-gbooro/` | `oju-gbooro/index.html` | Ojú Gbooro project |
| `/studio/` | `studio/index.html` | PENNIO Studio application |
| `/studio/guide/` | `studio/guide/index.html` | Studio guide |

`404.html` is an error document and should not be indexed. The Reel Studio,
campaign HTML, portfolio source and checklist print source are repository
resources, not intended search landing pages.

## Publishing and maintenance

1. Review changes on a branch before merging to `master`.
2. Confirm the GitHub Pages publishing source in repository Settings → Pages.
3. Keep `CNAME` aligned with the configured custom domain. Do not change DNS
   from this repository.
4. Keep canonical URLs and sitemap locations aligned. Public directory pages
   use trailing slashes.
5. Add new public pages to the sitemap only after confirming their purpose,
   metadata, canonical URL, internal links and deployed response.
6. Keep private/source material out of the generated site with `_config.yml`.
   `robots.txt` controls crawler access; it is not an access-control system.
7. Validate the production site after deployment and inspect indexing in Google
   Search Console. Sitemap submission does not guarantee indexing.

## Forms and third-party services

The site uses FormSubmit for selected forms and Meta Pixel on selected pages.
A successful front-end interaction does not prove delivery to the intended
inbox. Test form delivery and confirm inbox ownership with the site owner.

## Current limitations

The repository alone cannot establish Google's URL Inspection status, the
configured GitHub Pages source, DNS state, production deployment completion,
or Core Web Vitals field data. These require Search Console, GitHub Pages
settings/deployment records, DNS inspection and real-user performance data.
