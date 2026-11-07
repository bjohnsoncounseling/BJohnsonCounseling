# Working in this repository

Read [README.md](README.md) first for what the site is and how it is put
together. [OPERATIONS.md](OPERATIONS.md) covers accounts, deploys and alerts.
`docs/audit-2026-11-07.md` is the agreed list of open improvements.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Before opening a PR

Run all of these; CI runs the same set.

```sh
npm run check && npm run build && npm test          # site (tests read dist/, so build first)
cd workers/contact-form && npm test && npm run check # Worker, inside workerd
```

## Things that are easy to get wrong

- Practice facts (address, phone, licences, rates, insurers, services, nav)
  live only in `src/config/site.ts`. Don't restate them in a page.
- The contact form and its Worker share `shared/contact-contract.js`. Change a
  field name, a length limit or an error code there, not in either consumer.
- A Worker change is not live until `wrangler deploy` runs (or the `Deploy
Worker` workflow, once its secret exists). Say so in the PR.
- Internal links end in a slash (`/about/`).
- `<Image>` uses pass both `widths` and a `width` equal to the largest
  candidate, or the build emits the full-size original.
- The hero photo on a page goes through `heroImage()` in `src/lib/hero.ts`
  and the same result is passed to `BaseLayout`'s `preloadImage`.
- Copy changes that make clinical, legal or insurance claims need Brandon's
  sign-off; the audit lists the open questions.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
