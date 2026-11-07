// Checks on the built site in dist/, so run `npm run build` first (a stale dist/
// tests stale pages). Reads files only — no network and no server.
//
// Two things nothing else catches: internal links that lead nowhere, and the
// contact form drifting apart from its Worker. The form and the Worker deploy
// separately; what they share is shared/contact-contract.js (field names,
// length limits, error codes), so these tests check the built page and the
// Worker source against the contract rather than against each other.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { before, describe, it } from 'node:test';
import { ERRORS, FIELDS, MAX } from '../shared/contact-contract.js';

const SITE_HOSTS = new Set(['bjohnsoncounseling.com', 'www.bjohnsoncounseling.com']);

const fromRoot = (...parts) => join(import.meta.dirname, '..', ...parts);
const dist = (...parts) => fromRoot('dist', ...parts);

before(() => {
  assert.ok(existsSync(dist('index.html')), 'dist/ not found — run `npm run build` first.');
});

describe('internal links', () => {
  /** Built pages as dist-relative posix paths, e.g. `about/index.html`. */
  const pages = () =>
    readdirSync(dist(), { recursive: true, encoding: 'utf8' })
      .map((p) => p.replaceAll('\\', '/'))
      .filter((p) => p.endsWith('.html'));

  /** The dist file serving a pathname: an asset, a directory-format page, or a flat page (404). */
  const resolve = (pathname) => {
    const rel = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, '');
    return [rel, posix.join(rel, 'index.html'), `${rel}.html`].find((c) =>
      statSync(dist(c), { throwIfNoEntry: false })?.isFile(),
    );
  };

  it('every internal href and src resolves, including #fragments', () => {
    const broken = [];
    let checked = 0;

    for (const page of pages()) {
      const html = readFileSync(dist(page), 'utf8');
      const pageUrl = new URL(page.replace(/index\.html$/, ''), 'https://bjohnsoncounseling.com/');

      for (const [, , value] of html.matchAll(/\b(href|src)="([^"]*)"/g)) {
        const url = new URL(value.replaceAll('&amp;', '&'), pageUrl);
        if (!url.protocol.startsWith('http') || !SITE_HOSTS.has(url.hostname)) continue;
        checked++;

        const target = resolve(url.pathname);
        if (!target) {
          broken.push(`${page}: ${value} (no such page)`);
          continue;
        }
        const fragment = decodeURIComponent(url.hash.slice(1));
        if (fragment && !readFileSync(dist(target), 'utf8').includes(`id="${fragment}"`)) {
          broken.push(`${page}: ${value} (no element with that id)`);
        }
      }
    }

    assert.deepEqual(broken, []);
    // Guards against the regex above quietly matching nothing.
    assert.ok(checked > 20, `only ${checked} internal links found`);
  });
});

describe('contact form and Worker agree', () => {
  let page;
  let form;
  const worker = readFileSync(fromRoot('workers/contact-form/src/index.js'), 'utf8');
  const wrangler = readFileSync(fromRoot('workers/contact-form/wrangler.toml'), 'utf8');

  before(() => {
    page = readFileSync(dist('contact/index.html'), 'utf8');
    form = page.match(/<form\b[^>]*class="form"[\s\S]*?<\/form>/)?.[0];
    assert.ok(form, 'no contact form in dist/contact/index.html');
  });

  /** The first capture of a pattern that must match, so a rename fails loudly. */
  const capture = (text, pattern) => {
    const value = text.match(pattern)?.[1];
    assert.ok(value !== undefined, `nothing matched ${pattern}`);
    return value;
  };

  it('posts to a path the Worker is routed on', () => {
    const action = capture(form, /<form\b[^>]*\baction="([^"]+)"/);
    assert.ok(wrangler.includes(`pattern = "bjohnsoncounseling.com${action}"`), `no route for ${action}`);
  });

  it('sends exactly the fields in the contract', () => {
    const sent = new Set([...form.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"/g)].map((m) => m[1]));
    // Not in the markup: the Turnstile widget inserts this input when it renders.
    sent.add(FIELDS.turnstile);

    assert.deepEqual([...sent].sort(), Object.values(FIELDS).sort());
  });

  it('is read by the Worker through the contract, every field of it', () => {
    const read = [...worker.matchAll(/form\.get\(FIELDS\.(\w+)\)/g)].map((m) => m[1]);

    assert.deepEqual([...new Set(read)].sort(), Object.keys(FIELDS).sort());
    assert.doesNotMatch(worker, /form\.get\("/, 'the Worker reads a field by a literal name');
  });

  it('caps each text field at the length the Worker keeps', () => {
    const maxlength = (name) => Number(capture(form, new RegExp(`<(?:input|textarea)\\b[^>]*\\bname="${name}"[^>]*\\bmaxlength="(\\d+)"`)));

    assert.equal(maxlength(FIELDS.firstName), MAX.name);
    assert.equal(maxlength(FIELDS.lastName), MAX.name);
    assert.equal(maxlength(FIELDS.email), MAX.email);
    assert.equal(maxlength(FIELDS.phone), MAX.phone);
    assert.equal(maxlength(FIELDS.message), MAX.message);
  });

  it('asks Turnstile for the action the Worker requires', () => {
    assert.equal(
      capture(form, /class="cf-turnstile"[^>]*\bdata-action="([^"]*)"/),
      capture(wrangler, /^TURNSTILE_ACTION = "([^"]*)"/m),
    );
  });

  it('renders the Turnstile widget, without which the Worker rejects everything', () => {
    assert.ok(capture(form, /class="cf-turnstile"[^>]*\bdata-sitekey="([^"]*)"/), 'empty site key');
  });

  it('has a message for every error the Worker can return', () => {
    const codes = [...worker.matchAll(/respond\(\d+, "([^"]+)"\)/g)].map((m) => m[1]);

    assert.ok(codes.length > 0, 'no error codes found in the Worker');
    assert.deepEqual(codes.filter((code) => !ERRORS[code]), []);
  });

  it('offers no service or payment option the Worker would cut short', () => {
    for (const field of ['service', 'payment']) {
      const select = capture(form, new RegExp(`(<select\\b[^>]*\\bname="${FIELDS[field]}"[\\s\\S]*?</select>)`));
      const options = [...select.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
      assert.ok(options.length > 1, `no ${field} options found`);
      assert.deepEqual(options.filter((o) => o.length > MAX[field]), []);
    }
  });
});
