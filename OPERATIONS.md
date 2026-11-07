# Operations

Where everything lives and what to check, so the site and the contact form
can be kept running by someone who did not build them. No secrets here: the
repo is public. Secrets are named so they can be found, never written down.

Brandon is the only person with access to every account below. Items marked
**(fill in)** are for him to complete in the private copy of this file, or in
the password manager entry it points to.

## Accounts

| Account                                                         | What it holds                                                                                                                                                          | Sign-in                                                    | Recovery                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| Cloudflare (account `3cd9c69c…`, zone `bjohnsoncounseling.com`) | DNS, DNSSEC, the Pages project `bjohnsoncounseling`, the Worker `bjc-contact-form`, the Turnstile widget, Email Routing destination addresses, the domain registration | Brandon's email + password + 2FA **(fill in: 2FA method)** | Backup codes **(fill in: where they are kept)**           |
| Cloudflare Registrar                                            | `bjohnsoncounseling.com`, transferred in 2026-10-21, expires 2028-05-08, auto-renew **(fill in: confirm it is on, and which card)**                                    | same account                                               | registrant contact email **(fill in)**                    |
| GitHub org `bjohnsoncounseling`                                 | this repository (public), Actions, Dependabot, the `CLOUDFLARE_API_TOKEN` Actions secret once added                                                                    | Brandon's GitHub login + 2FA                               | **(fill in: second org owner)**                           |
| Google Workspace Business Starter                               | `brandon@bjohnsoncounseling.com` (the inbox the form delivers to), MX for the domain                                                                                   | Google Admin                                               | billed directly to Google **(fill in: card and renewal)** |

Squarespace is gone: the website subscription was cancelled 2026-10-21 and the
domain left Squarespace Domains the same day. Nothing there needs renewing.

## Secrets and where each one is set

| Secret                 | Set where                                                                             | Used for                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `TURNSTILE_SECRET`     | Worker secret (`npx wrangler secret put TURNSTILE_SECRET` in `workers/contact-form/`) | server-side verification of the form's Turnstile token                                                                                      |
| `DEST_EMAIL`           | Worker secret (same command)                                                          | the inbox the form delivers to; must be a verified Email Routing destination address                                                        |
| `CLOUDFLARE_API_TOKEN` | GitHub repo secret (Settings → Secrets and variables → Actions)                       | lets the `Deploy Worker` workflow deploy on a push to `main`; a Workers-scoped token (template "Edit Cloudflare Workers"), not a global key |

The Turnstile **site** key is public and lives in `src/config/site.ts`.

## Deploying

- **Site:** merge to `main`. Cloudflare Pages builds and publishes within a
  couple of minutes. Every PR gets a preview at a `*.pages.dev` URL (which
  search engines are told not to index).
- **Worker:** either merge a change under `workers/contact-form/` or `shared/`
  to `main` with the `CLOUDFLARE_API_TOKEN` secret in place (the `Deploy
Worker` workflow runs the tests and deploys), or from a laptop:

  ```sh
  cd workers/contact-form
  npm install
  npx wrangler login      # once; opens a browser
  npm run deploy
  ```

  Without the secret the workflow prints a warning and deploys nothing, so a
  merged Worker change can sit undeployed. Check the Actions tab after merging
  one.

## Changing the two switches without a terminal

1. On GitHub, open `src/config/site.ts` and press the pencil icon.
2. Change `acceptingNewClients = true` to `false` (or back), or the same for
   `offerCouplesCounseling`.
3. "Commit changes…", choose "Commit directly to the main branch", commit.
4. The site rebuilds on its own. Two to three minutes later the change is live.

## Routine checks

| When                   | What                         | How                                                                                                                                                                                           |
| ---------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monthly                | The live form still delivers | Submit it at `/contact/` with JavaScript on; confirm the email arrives and that replying goes to the address you typed                                                                        |
| Monthly                | Worker errors                | Cloudflare → Workers & Pages → `bjc-contact-form` → Observability. `send failed`, `turnstile rejected` with `invalid-input-secret`, or a run of `honeypot tripped` each mean something to fix |
| Quarterly              | Domain and billing           | Cloudflare → Domain Registration: auto-renew on, card not expiring. Google Admin → Billing                                                                                                    |
| Quarterly              | Directories match the site   | TherapyFinder, EMDRIA, Psychology Today, Google Business Profile: address, phone, website, insurers, "accepting new clients" all agree with `site.ts`                                         |
| Annually               | Notice of Privacy Practices  | The effective date on `/privacy-and-no-surprises/`                                                                                                                                            |
| Any DNS change         | Mail and the form still send | The apex SPF TXT still contains `include:_spf.google.com include:_spf.mx.cloudflare.net`; the `cf2024-1._domainkey` TXT and the `google._domainkey` TXT still exist; `_dmarc` still exists    |
| Turnstile key rotation | Both halves updated          | New site key into `site.ts` and merge; `npx wrangler secret put TURNSTILE_SECRET`; redeploy the Worker                                                                                        |

## Alerts to set up (dashboard, one-time)

- Cloudflare → Notifications: "Workers error rate" (or "Workers Logs") for
  `bjc-contact-form` to Brandon's email, so a failing send is noticed before
  the monthly check.
- An external uptime check on `https://bjohnsoncounseling.com/` and
  `/contact/` (any free monitor), emailing Brandon.
- Cloudflare → Scrape Shield → Email Address Obfuscation: **off**. On, it
  rewrites every address on the site for visitors without JavaScript and some
  assistive technology.

## If something is broken

| Symptom                                                     | First look                                                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Site down or stale                                          | Cloudflare → Workers & Pages → `bjohnsoncounseling` → Deployments: did the last build fail? Retry it or revert the commit                                                      |
| Form shows "couldn't verify that you're human" for everyone | Turnstile secret or site key changed, or `TURNSTILE_HOSTNAMES` in `wrangler.toml` doesn't include the host people are on                                                       |
| Form shows "Something went wrong on our end"                | Worker logs say `send failed`. Usually the destination address lost its verification, or Email Routing was changed. Re-verify under Cloudflare → Email → Destination addresses |
| Form "sent" but nothing arrives                             | Check spam first. Then the DNS rows above (SPF/DKIM). Then a run of `honeypot tripped` in the logs, which would mean browsers are filling the hidden field                     |
| Mail to the practice stops                                  | DNS: MX must still point at Google (`aspmx.l.google.com` and the four alt hosts). Never run Email Routing's "Activate" wizard: it replaces the MX with Cloudflare's            |
| Worker change merged but behaviour unchanged                | It was not deployed. See Deploying                                                                                                                                             |

## Rebuilding from scratch

Everything needed is in this repository except the two Worker secrets and the
Turnstile widget. Order: Cloudflare Pages project from the repo (build command
`npm run build`, output `dist`), custom domain, Turnstile widget (hostnames
`bjohnsoncounseling.com` and `bjohnsoncounseling.pages.dev`, action
`contact`), Worker secrets, Worker deploy. `workers/contact-form/README.md`
has the exact steps.
