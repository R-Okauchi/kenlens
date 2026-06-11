# KenLens Privacy Policy

Effective date: June 10, 2026

This document is the source of truth. The landing page renders an equivalent privacy page. The Japanese version is `privacy-policy.ja.md`.

KenLens is a Chrome extension that shows citation counts, open-access (OA) availability, and DOIs on researcher pages at researchmap.jp. This is not research evaluation — it visualizes public metadata and supports profile maintenance.

## 1. What we do NOT collect

KenLens does none of the following:

- **No analytics**: no Google Analytics or any other analytics SDK is bundled.
- **No accounts**: there is no sign-up or login, and no user identifier is issued.
- **No browsing-history collection**: nothing about the pages you visit is sent to the developer or any third party.
- **No developer server**: the developer operates no data-collection server (the remote-config fetch described below is a static JSON file on GitHub Pages).

## 2. Data sent off your browser

Only the minimum needed to render the overlay is sent, and only to the following public/academic APIs, solely to process the researchmap page you are viewing.

| Destination | Data sent | Purpose |
| --- | --- | --- |
| `api.researchmap.jp` | The permalink (URL slug) of the researcher page you are viewing | Fetch the public publication list (`GET /{permalink}/published_papers?limit=1000&start=N`) |
| `api.openalex.org` | Publication DOIs (plus your optional OpenAlex API key, if configured); in the maintenance report, the OpenAlex author-record ID derived from those DOIs | Fetch citation counts and OA status (`GET /works/doi:{DOI}`), and author-works listing for the maintenance report |
| `api.crossref.org` | Publication DOIs; for Latin-script publications without a DOI: title, publication year, and first author's family name | Citation-count fallback and DOI-candidate matching (`query.bibliographic`) |
| `api.unpaywall.org` | Publication DOIs | OA status (only on the Crossref fallback path) |
| `r-okauchi.github.io` | Nothing (a static `config.json` is fetched) | Remote operational flag used to disable external-API mode in case of an incident. Checked once a day and on install |

Notes:

- Title matching applies only to Latin-script titles, and only bibliographic data already public on the page (title, year, first author family name) is sent.
- BibTeX files pasted into or selected in the maintenance report are processed entirely inside your browser and never transmitted.
- Requests to Crossref and Unpaywall include the **developer's** contact email address as a parameter, per those APIs' "polite pool" guidelines. Your email address is never sent.
- All of the above is public bibliographic metadata from researchmap — none of it is information about you.
- Requests are self-throttled per host (researchmap: 1 request/second, single concurrency; others similarly limited).

## 3. Purposes

The data above is used exclusively to:

1. Fetch the public publication list of the researcher page being viewed.
2. Fetch and display citation counts, OA status, and DOI information per publication.
3. Suggest DOI candidates for publications without a registered DOI (profile-maintenance support).

It is never used for advertising, profiling, or any unrelated purpose, and it is never sold or shared.

## 4. Data stored in your browser (local cache and settings)

Everything below stays inside your browser (`chrome.storage`) and is never transmitted to the developer.

- **API response cache** (`chrome.storage.local`):
  - researchmap publication lists: 24 hours
  - per-DOI lookup results from external databases: 7 days
  - title-to-DOI matching results: 30 days
  - Expired entries and entries beyond the size cap (about 20,000) are pruned daily. You can clear the entire cache at any time via "Clear cache" in Settings.
- **Display settings** (`chrome.storage.sync`): badge toggles, language, data mode. If you have browser account sync enabled, these sync across your devices through your browser vendor's sync mechanism (e.g., Google); no developer server is involved.
- **Optional OpenAlex API key** (`chrome.storage.local`): stored only if you configure it. It is intentionally excluded from sync and kept on the local device only. It is sent only to `api.openalex.org`.
- **Summary-card collapsed state** (`chrome.storage.local`).

Uninstalling the extension removes all of this data via the browser.

## 5. Permissions

| Permission | Use |
| --- | --- |
| `storage` | Stores the cache and settings described above |
| `alarms` | Daily pruning of expired cache entries and daily check of the remote operational flag |
| `https://api.researchmap.jp/*` | Fetch the public publication list of the researcher being viewed |
| `https://api.openalex.org/*` | Fetch citation counts and OA status |
| `https://api.crossref.org/*` | Citation-count fallback and DOI-candidate matching |
| `https://api.unpaywall.org/*` | OA-status fallback |

The content script runs only on `https://researchmap.jp/*`. The extension does nothing on any other site and cannot read other pages. Choosing the "Page data only" mode in Settings makes no connections to external databases at all.

## 6. Third-party API terms

- researchmap: <https://researchmap.jp/>
- OpenAlex: <https://openalex.org/>
- Crossref: <https://www.crossref.org/>
- Unpaywall: <https://unpaywall.org/>

## 7. Contact

Questions and reports are handled via GitHub Issues:

- <https://github.com/R-Okauchi/kenlens/issues/new>

## 8. Changes to this policy

When this policy changes, this document and the landing-page privacy page are updated and the effective date is revised. Material changes — such as new data types being sent or new destinations — are announced in the extension's store update notes and the repository release notes.
