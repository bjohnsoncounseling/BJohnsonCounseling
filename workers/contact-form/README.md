# Contact-form Worker

The backend for the [bjohnsoncounseling.com/contact](https://bjohnsoncounseling.com/contact/)
form. A standalone Cloudflare Worker — **not** a Pages Function, which can't use
the `send_email` binding — that verifies the Turnstile token server-side,
rate-limits per IP, and delivers the message through **Cloudflare Email
Routing**. No third-party form processor. Same code lineage as the
litbible.net / liberatingscripture.org contact Workers.

The site itself deploys to Cloudflare Pages. This Worker owns `/api/contact` at
the edge (Worker routes take precedence over Pages on the same path), so the
form POST is handled here while everything else stays on Pages.

- **Route:** `bjohnsoncounseling.com/api/contact` (+ `www.`).
- **From:** `contact@bjohnsoncounseling.com`, with `Reply-To:` set to the submitter.
- **To:** the `DEST_EMAIL` secret (a verified Email Routing destination, kept out of the repo).

> **Timing:** the route attaches only once `bjohnsoncounseling.com` is served
> through Cloudflare (after the DNS migration). Until then the site lives on
> `*.pages.dev`, where custom Worker routes don't apply — so deploy this as part
> of the migration cutover.

## One-time setup (owner, Cloudflare dashboard + CLI)

This is the same setup already running for litbible.net.

1. **Email Routing** (dashboard → bjohnsoncounseling.com → Email → Email Routing):
   enable it, but **keep the existing Google Workspace MX records** — Email
   Routing is used here only to *send*; incoming mail stays with Workspace. Then
   add + **verify** your inbox as a *destination address* (Cloudflare emails a
   confirmation link). `contact@bjohnsoncounseling.com` does **not** need to exist
   as a routing rule — it's only the sender identity.
2. **Turnstile** (dashboard → Turnstile → Add widget, Managed, hostname
   `bjohnsoncounseling.com`): copy the **Site Key** into
   `src/config/site.ts` (`turnstileSiteKey`, public by design) and keep the
   **Secret Key** for step 4.
3. **Install & authenticate** (in this directory):

   ```sh
   npm install
   npx wrangler login
   ```

4. **Secrets:**

   ```sh
   npx wrangler secret put TURNSTILE_SECRET   # the Turnstile SECRET key (step 2)
   npx wrangler secret put DEST_EMAIL         # your inbox — the verified destination from step 1
   ```

   (On first `secret put`, wrangler offers to create the Worker — say yes.)

5. **Deploy:**

   ```sh
   npm run deploy
   ```

   The route in `wrangler.toml` attaches automatically.

6. **Smoke test** on the live site: submit the form with JS on (inline success
   message), then once with JS disabled (should land back on
   `/contact/?submitted=ok`), and confirm both emails arrive with a working
   Reply-To.

## Abuse protection

- **Turnstile** server-side verification gates bots.
- A **rate-limiting binding** (`[[ratelimits]]` in `wrangler.toml`) caps
  submissions at 5/minute per client IP → 429 with a "wait a minute" message.
  Best-effort per Cloudflare location — a cost cap, not a security boundary.
- A hidden **honeypot** (`company` field) — a filled value "succeeds" without
  sending anything.

## Development notes

- `npm run dev` runs the Worker locally. `send_email` is simulated: wrangler
  writes the would-be email to a local file instead of sending. Provide
  `TURNSTILE_SECRET` and `DEST_EMAIL` in a local `.dev.vars` file (gitignored).
  For local testing use Turnstile's always-passes test secret
  `1x0000000000000000000000000000000AA` and a matching test **site** key
  `1x00000000000000000000AA` in `src/config/site.ts`.
- `npm run check` bundles the Worker without deploying (no auth needed) — a
  CI-friendly sanity check.
- Dead ends, so nobody re-litigates them: MailChannels-from-Workers shut down in
  Aug 2024; Cloudflare Email Service (arbitrary recipients) is beta/paid and
  unnecessary here — Email Routing's `send_email` binding to a verified
  destination is free and sufficient, and (unlike enabling Email Routing's MX)
  it does not disturb the domain's Google Workspace mail.
