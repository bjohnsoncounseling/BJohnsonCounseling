# bjohnsoncounseling.com

The website for Brandon Johnson Counseling, a solo therapy practice in SE
Portland. A static [Astro](https://astro.build) site on Cloudflare Pages, with
one piece of server code: a Cloudflare Worker that delivers the contact form.

| Part | Where | Deployed how |
|---|---|---|
| Site (seven pages + 404) | `src/` | Cloudflare Pages builds `main` on every push and every PR gets a `*.pages.dev` preview |
| Contact-form backend | `workers/contact-form/` | `npm run deploy` there, or the `Deploy Worker` workflow on a push to `main` once the `CLOUDFLARE_API_TOKEN` secret exists (see [OPERATIONS.md](OPERATIONS.md)) |
| Form/Worker contract | `shared/contact-contract.js` | Imported by both; nothing to deploy |

Everything about the practice that appears on a page (name, licences, address,
phone, rates, insurers, memberships, services, nav) lives in
[`src/config/site.ts`](src/config/site.ts). Pages, the footer and the JSON-LD
structured data all read from it, so a fact changes in one place.

## Two switches

Both are in `src/config/site.ts`. Flip the value, commit to `main`, and the
site rebuilds; no other step. OPERATIONS.md has the no-terminal version (edit
the file on GitHub).

- `acceptingNewClients` shows or hides the "not taking new clients" notice on
  the contact page and changes every button that leads there from "Book a
  Consultation" to "Get in Touch". The form itself always renders.
- `offerCouplesCounseling` shows or hides everything about couples counseling:
  the service cards, the form option, the couples rate and private-pay note,
  the techniques entry, and the word "couples" in the bio and meta
  descriptions.

## How the contact form works

```
visitor ── POST /api/contact ──▶ Worker (workers/contact-form)
                                   │ Origin + body-size check
                                   │ per-IP rate limit (5/min)
                                   │ honeypot, field validation
                                   │ Turnstile token verified server-side
                                   ▼
                          Cloudflare Email Routing send_email
                                   ▼
                     brandon@… inbox (Google Workspace), Reply-To = visitor
```

- The Worker route `bjohnsoncounseling.com/api/contact` takes precedence over
  Pages for that one path. It is a Worker, not a Pages Function, because the
  `send_email` binding is Workers-only.
- Nothing is stored anywhere. The message is emailed and forgotten.
- With JavaScript the form submits by `fetch` and shows the result inline;
  without it the Worker answers with a redirect to
  `/contact/?submitted=ok|error&reason=…` and the page shows the same banner.
- Turnstile is the bot gate. Its public site key is in `site.ts`; the secret
  and the destination inbox are Worker secrets set with `wrangler secret put`.
- Setup, DNS records for deliverability and local-development notes are in
  [`workers/contact-form/README.md`](workers/contact-form/README.md).

**Previews can't send.** The Turnstile widget renders on `*.pages.dev`, but
the Worker rejects tokens minted there on purpose, so a form submitted from a
preview deploy fails verification. That is expected, not a broken form. To see
the banners on a preview, open `/contact/?submitted=ok` or
`/contact/?submitted=error&reason=send`.

## Working on it

Needs Node 24 (`.nvmrc`; Astro requires 22.12 or newer).

```sh
npm install
npm run dev        # http://localhost:4321
npm run check      # astro check (types)
npm run build      # writes dist/
npm test           # checks dist/: internal links, form vs the contract. Build first.
```

The Worker is its own npm package with its own lockfile:

```sh
cd workers/contact-form
npm install
npm test           # runs inside workerd; Turnstile stubbed, nothing sent
npm run check      # bundles without deploying
npm run deploy     # needs `npx wrangler login` once
```

CI (`.github/workflows/ci.yml`) runs type-check, build, the site tests, the
Worker tests and a Worker dry-run bundle on every push and PR, plus
`npm audit` on both trees. Dependabot keeps both lockfiles and the Actions
pins current (`.github/dependabot.yml` explains the grouping).

### Layout

```
src/config/site.ts       practice facts, the two switches, services, form options
src/pages/               one .astro file per page
src/components/          Header, Footer, PageHero, ContactForm, Button, CTASection
src/layouts/BaseLayout   <head>, preloads, Open Graph tags, JSON-LD
src/lib/hero.ts          resolves a hero photo once for the <img> and its preload
src/assets/images/       photos (processed by Astro at build time)
src/styles/              tokens.css (colours, type, spacing) and global.css
public/_headers          security headers, CSP, noindex on previews, cache rules
shared/                  the form/Worker contract
test/                    node:test suite over dist/
workers/contact-form/    the Worker, its tests and README
docs/                    the 2026-11-07 site audit
```

### Conventions

- Prose and facts come from `site.ts` or the page file; nothing is fetched at
  runtime and there is no CMS.
- Images go through `<Image>` from `astro:assets` with `widths` and a
  `width` equal to the largest candidate, so the build never emits an
  unresized original.
- Internal links end in a slash (`/about/`); the config sets
  `trailingSlash: 'always'` and Pages serves `/about/index.html`.
- Commit messages are plain imperative sentences; PRs are squash-merged.

## Licensing of content

The hero and service photographs are free-licensed stock (Unsplash and Pexels
licences). The Mt. Hood photo on the homepage is CC BY 2.0 and credited in the
caption. Office photos and the headshot are the practice's own.
