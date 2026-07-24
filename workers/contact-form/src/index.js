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
 *   1. rate-limits per IP (5/min → 429, fail-open);
 *   2. drops honeypot hits silently (a filled `company` field);
 *   3. validates the form fields;
 *   4. verifies the Cloudflare Turnstile token server-side (siteverify);
 *   5. sends via the Email Routing `send_email` binding, from FROM_EMAIL
 *      (contact@bjohnsoncounseling.com) with Reply-To set to the submitter, to
 *      the verified destination inbox (DEST_EMAIL secret).
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

const MAX = { name: 100, email: 200, phone: 40, service: 60, message: 5000 };

// Header-bound fields must never carry CR/LF (header injection) — collapse all
// whitespace runs. The message body keeps its newlines.
const headerSafe = (v, max) =>
  String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Fails closed on anything that isn't a plausible address. */
const looksLikeEmail = (s) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= MAX.email;

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

    // Honeypot. Silently accept so bots don't learn they were caught.
    if (headerSafe(form.get("company"), 50)) return respond(200);

    const firstName = headerSafe(form.get("firstName"), MAX.name);
    const lastName = headerSafe(form.get("lastName"), MAX.name);
    const email = headerSafe(form.get("email"), MAX.email);
    const phone = headerSafe(form.get("phone"), MAX.phone);
    const service = headerSafe(form.get("service"), MAX.service);
    const message = String(form.get("message") || "").trim().slice(0, MAX.message);

    if (!firstName || !lastName || !email || !service || !message) return respond(400, "missing");
    if (!looksLikeEmail(email)) return respond(400, "email");

    const token = String(form.get("cf-turnstile-response") || "");
    if (!(await verifyTurnstile(env.TURNSTILE_SECRET, token, request))) {
      return respond(403, "verification");
    }

    try {
      await env.CONTACT_EMAIL.send(
        buildEmail(env, request, { firstName, lastName, email, phone, service, message })
      );
    } catch (err) {
      console.error("send failed:", err);
      return respond(500, "send");
    }

    return respond(200);
  },
};

function buildEmail(env, request, { firstName, lastName, email, phone, service, message }) {
  const name = `${firstName} ${lastName}`;
  const msg = createMimeMessage();
  msg.setSender({ name: "BJC contact form", addr: env.FROM_EMAIL });
  msg.setRecipient(env.DEST_EMAIL);
  // mimetext validates known headers: Reply-To must be a Mailbox, not a bare
  // string (a string throws MIMETEXT_INVALID_HEADER_VALUE).
  msg.setHeader("Reply-To", new Mailbox(email));
  msg.setSubject(`Website enquiry — ${name} (${service})`);
  msg.addMessage({
    contentType: "text/plain",
    data: [
      "New message from the bjohnsoncounseling.com contact form.",
      "",
      `Name:    ${name}`,
      `Email:   ${email}`,
      `Phone:   ${phone || "—"}`,
      `Service: ${service}`,
      "",
      "Message:",
      message,
      "",
      `— ${sentLine(request)}; reply to this email to answer.`,
    ].join("\n"),
  });
  return new EmailMessage(env.FROM_EMAIL, env.DEST_EMAIL, msg.asRaw());
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

async function verifyTurnstile(secret, token, request) {
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: request.headers.get("CF-Connecting-IP") || "",
      }),
    });
    const verdict = await res.json();
    if (verdict.success !== true) {
      // Only Turnstile's error codes — no submitter data. Visible in
      // `wrangler tail`; distinguishes a misconfigured secret
      // (invalid-input-secret) from a bad/expired token.
      console.warn("turnstile rejected:", JSON.stringify(verdict["error-codes"] ?? []));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// The no-JS native POST goes back to the contact page with the outcome in the
// query string; the page's inline script reveals the matching status banner.
function redirect(url, error) {
  const target = new URL("/contact/", url.origin);
  target.searchParams.set("submitted", error ? "error" : "ok");
  if (error) target.searchParams.set("reason", error);
  return Response.redirect(target.toString(), 303);
}
