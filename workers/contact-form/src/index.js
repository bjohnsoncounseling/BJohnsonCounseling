/**
 * bjohnsoncounseling.com contact-form backend.
 *
 * A standalone Cloudflare Worker — NOT a Pages Function, because the
 * `send_email` binding is Workers-only. It owns POST /api/contact at the edge
 * (see wrangler.toml `routes`); Pages serves everything else, and Worker routes
 * take precedence over Pages on the same path. Adapted from litbible.net's
 * contact Worker (same code lineage).
 *
 * Per request it:
 *   1. refuses a cross-site Origin and an oversized body;
 *   2. rate-limits per IP (5/min → 429, fail-open);
 *   3. drops honeypot hits silently (a filled `leave_blank` field);
 *   4. validates the form fields;
 *   5. verifies the Cloudflare Turnstile token server-side (siteverify);
 *   6. sends via the `send_email` binding, from FROM_EMAIL
 *      (contact@bjohnsoncounseling.com) with Reply-To set to the submitter, to
 *      the verified destination inbox (DEST_EMAIL secret).
 *
 * Field names, length limits and error codes come from the contract module
 * shared with the page (shared/contact-contract.js at the repo root).
 *
 * Nothing is persisted — the message is emailed to Brandon and forgotten; the
 * form asks people not to include sensitive health details.
 *
 * Two client paths:
 *   - the page's fetch() submit sends `Accept: application/json` and gets a
 *     JSON verdict ({ ok: true } or { ok: false, error });
 *   - a no-JS native POST gets a 303 back to /contact/?submitted=ok|error&reason=…
 *     so the page's status banner can show the result without JavaScript.
 */

import { EmailMessage } from "cloudflare:email";
// The browser build — the Node build drags in node:path/os, which Workers
// would need the nodejs_compat flag for.
import { createMimeMessage, Mailbox } from "mimetext/browser";
import { FIELDS, MAX, MAX_BODY_BYTES } from "../../../shared/contact-contract.js";

// Header-bound fields must never carry CR/LF (header injection) — collapse all
// whitespace runs. The message body keeps its newlines.
const headerSafe = (v, max) =>
  String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Fails closed on anything that isn't a plausible address. The address goes
 * into the Reply-To header as a Mailbox, so the characters RFC 5322 gives
 * structural meaning (angle brackets, parentheses, quotes, commas, colons,
 * semicolons, backslashes) are refused rather than passed through.
 */
const looksLikeEmail = (s) =>
  /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/.test(s) && s.length <= MAX.email;

/** Hostnames the form may be served from (set in wrangler.toml). */
const allowedHostnames = (env) =>
  String(env.TURNSTILE_HOSTNAMES || "").split(",").map((h) => h.trim()).filter(Boolean);

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
    }

    const url = new URL(request.url);
    const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
    // One decision, two shapes of answer: JSON for fetch(), a 303 redirect for
    // the no-JS native POST.
    const respond = (status, error) =>
      wantsJson
        ? Response.json(error ? { ok: false, error } : { ok: true }, { status })
        : redirect(url, error);

    // Browsers send Origin on every POST. Turnstile's hostname check is the
    // real cross-site defence; this refuses the obvious case before any work.
    // A missing Origin (curl, some privacy settings) is left to Turnstile.
    const origin = request.headers.get("Origin");
    if (origin && !allowedHostnames(env).includes(hostnameOf(origin))) {
      return respond(403, "verification");
    }

    // Refuse a body declared larger than the form could ever produce before
    // parsing it. A missing or unparsable Content-Length is left to formData().
    if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) {
      return respond(413, "malformed");
    }

    // Per-IP rate limit before doing any real work. Fail open on a binding
    // hiccup — a broken limiter shouldn't take the contact form down.
    try {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return respond(429, "ratelimited");
    } catch (err) {
      console.warn("rate limiter unavailable:", err);
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return respond(400, "malformed");
    }

    // Honeypot. Silently accept so bots don't learn they were caught. The
    // warning is the only trace, so a run of them in Workers Logs is how a
    // false positive (a real person's browser filling the field) would show.
    if (headerSafe(form.get(FIELDS.honeypot), 50)) {
      console.warn("honeypot tripped");
      return respond(200);
    }

    const firstName = headerSafe(form.get(FIELDS.firstName), MAX.name);
    const lastName = headerSafe(form.get(FIELDS.lastName), MAX.name);
    const email = headerSafe(form.get(FIELDS.email), MAX.email);
    const phone = headerSafe(form.get(FIELDS.phone), MAX.phone);
    const service = headerSafe(form.get(FIELDS.service), MAX.service);
    const payment = headerSafe(form.get(FIELDS.payment), MAX.payment);
    const message = String(form.get(FIELDS.message) || "").trim().slice(0, MAX.message);

    if (!firstName || !lastName || !email || !phone || !service || !payment || !message) return respond(400, "missing");
    if (!looksLikeEmail(email)) return respond(400, "email");

    const token = String(form.get(FIELDS.turnstile) || "");
    if (!(await verifyTurnstile(env, token, request))) {
      return respond(403, "verification");
    }

    try {
      await env.CONTACT_EMAIL.send(
        buildEmail(env, request, { firstName, lastName, email, phone, service, payment, message })
      );
    } catch (err) {
      console.error("send failed:", err);
      return respond(500, "send");
    }

    return respond(200);
  },
};

function hostnameOf(origin) {
  try {
    return new URL(origin).hostname;
  } catch {
    return ""; // "null" or garbage: never allowed
  }
}

function buildEmail(env, request, { firstName, lastName, email, phone, service, payment, message }) {
  const name = `${firstName} ${lastName}`;
  const msg = createMimeMessage();
  msg.setSender({ name: "Brandon Johnson Counseling website", addr: env.FROM_EMAIL });
  msg.setRecipient(env.DEST_EMAIL);
  // mimetext validates known headers: Reply-To must be a Mailbox, not a bare
  // string (a string throws MIMETEXT_INVALID_HEADER_VALUE).
  msg.setHeader("Reply-To", new Mailbox(email));
  msg.setSubject(`Website inquiry — ${name} (${service})`);
  msg.addMessage({
    contentType: "text/plain",
    // Base64 rather than mimetext's 7bit default: the message is free text, so
    // it can carry non-ASCII (accents, emoji, CJK) and single lines longer than
    // the 998 characters SMTP allows. Base64 wraps at 76 and is 8-bit safe.
    // mimetext only labels the part; the data has to arrive already encoded.
    encoding: "base64",
    data: base64Lines([
      "New message from the bjohnsoncounseling.com contact form.",
      "",
      `Name:    ${name}`,
      `Email:   ${email}`,
      `Phone:   ${phone}`,
      `Service: ${service}`,
      `Payment: ${payment}`,
      "",
      "Message:",
      message,
      "",
      `— ${sentLine(request)}; reply to this email to answer.`,
    ].join("\n")),
  });
  return new EmailMessage(env.FROM_EMAIL, env.DEST_EMAIL, msg.asRaw());
}

/** UTF-8 text as base64, folded at the 76 columns RFC 2045 allows per line. */
function base64Lines(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/.{76}(?=.)/g, "$&\r\n");
}

// The footer shows the SENDER's local time (from Cloudflare's IP-geolocation
// zone on the request) — the mail client already localizes the Date: header to
// the reader's zone, so sender-local is the one piece of timing context the
// header can't provide.
function sentLine(request) {
  const zone = request.cf?.timezone;
  if (zone) {
    try {
      const when = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        dateStyle: "medium",
        timeStyle: "long",
      }).format(new Date());
      return `Sent ${when} (sender's local time)`;
    } catch {
      // fall through to UTC
    }
  }
  return `Sent ${new Date().toISOString()}`;
}

async function verifyTurnstile(env, token, request) {
  // Real tokens are well under 2048 chars; anything else is junk.
  if (!token || token.length > 2048) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
        remoteip: request.headers.get("CF-Connecting-IP") || "",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const verdict = await res.json();
    if (verdict.success !== true) {
      // Only Turnstile's error codes — no submitter data. Visible in Workers
      // Logs; distinguishes a misconfigured secret (invalid-input-secret) from
      // a bad/expired token.
      console.warn("turnstile rejected:", JSON.stringify(verdict["error-codes"] ?? []));
      return false;
    }
    // A real verdict always names the action and hostname the token was minted
    // for. Only the always-pass test secret omits them, so a verdict without
    // them is honoured only when TURNSTILE_DEV is set (in .dev.vars, for
    // `wrangler dev`). In production that secret would otherwise let a token
    // from any site, for any action, unlock the form.
    if (!verdict.action || !verdict.hostname) {
      if (env.TURNSTILE_DEV) return true;
      console.warn("turnstile verdict without action/hostname (test secret in production?)");
      return false;
    }
    // A token minted for another action, or on another site that shares the
    // widget (e.g. the pages.dev preview), must not unlock this form.
    if (verdict.action !== env.TURNSTILE_ACTION) {
      console.warn("turnstile action mismatch:", verdict.action);
      return false;
    }
    if (!allowedHostnames(env).includes(verdict.hostname)) {
      console.warn("turnstile hostname not allowed:", verdict.hostname);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("turnstile verify failed:", err && err.name);
    return false;
  }
}

// The no-JS native POST goes back to the contact page with the outcome in the
// query string; the page's script reveals the matching status banner.
function redirect(url, error) {
  const target = new URL("/contact/", url.origin);
  target.searchParams.set("submitted", error ? "error" : "ok");
  if (error) target.searchParams.set("reason", error);
  return Response.redirect(target.toString(), 303);
}
