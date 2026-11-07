// Tests for the contact-form Worker. Adapted from litbible.net's Worker tests
// (same code lineage).
//
// These run inside workerd via @cloudflare/vitest-plugin, so `cloudflare:email`
// and EmailMessage are the real thing. The Worker's entry is
// `fetch(request, env)` with env as a plain parameter, so each test calls it
// directly with a hand-built env — no real send_email or ratelimit binding is
// provisioned, and CONTACT_EMAIL.send / RATE_LIMITER.limit are plain spies.
//
// Turnstile's siteverify is the only outbound fetch; it is stubbed per test.
import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src/index.js";
import { FIELDS, MAX, MAX_BODY_BYTES } from "../../../shared/contact-contract.js";

const BASE = "https://bjohnsoncounseling.com";
const PATH = "/api/contact";
const IP = "203.0.113.7";

/** A submission that passes every check, so each test can vary one field. */
const VALID = {
  [FIELDS.firstName]: "Ada",
  [FIELDS.lastName]: "Lovelace",
  [FIELDS.email]: "ada@example.com",
  [FIELDS.phone]: "(503) 555-0100",
  [FIELDS.service]: "Individual Counseling",
  [FIELDS.payment]: "Out of Pocket",
  [FIELDS.message]: "Hello there",
  [FIELDS.turnstile]: "tok",
};

/** What siteverify returns for a token minted on the live form. */
const GOOD_VERDICT = { success: true, action: "contact", hostname: "bjohnsoncounseling.com" };

function makeEnv(overrides = {}) {
  return {
    FROM_EMAIL: "contact@bjohnsoncounseling.com",
    DEST_EMAIL: "inbox@example.com",
    TURNSTILE_SECRET: "test-secret",
    TURNSTILE_ACTION: "contact",
    TURNSTILE_HOSTNAMES: "bjohnsoncounseling.com,www.bjohnsoncounseling.com",
    CONTACT_EMAIL: { send: vi.fn() },
    RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    ...overrides,
  };
}

/** Stub the siteverify call. Returns the spy so tests can assert on it. */
function stubSiteverify(verdict = GOOD_VERDICT) {
  const fn = vi.fn(async () => Response.json(verdict));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function post(fields = {}, { env, json = true, method = "POST", cf, headers: extra = {} } = {}) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  const headers = { "CF-Connecting-IP": IP, ...extra };
  if (json) headers.Accept = "application/json";
  const init = method === "GET" ? { method, headers } : { method, body, headers };
  if (cf) init.cf = cf;
  return worker.fetch(new Request(BASE + PATH, init), env);
}

/**
 * workerd stores an outbound EmailMessage's MIME under the namespaced own
 * property "EmailMessage::raw" — `.raw` is undefined on outbound messages.
 * Guarded so a workerd rename fails loudly here instead of turning every body
 * assertion vacuous.
 */
function rawOf(msg) {
  const raw = msg["EmailMessage::raw"] ?? msg.raw;
  if (typeof raw !== "string") {
    throw new Error(
      "Could not read raw MIME off EmailMessage — workerd may have renamed the property.",
    );
  }
  return raw;
}

/** Decode RFC 2047 encoded-words. The subject always contains an em dash, so
 *  mimetext base64-encodes it; comparing against the raw header would never match. */
function decodeMimeWords(s) {
  return s.replace(/=\?utf-8\?B\?([^?]*)\?=/gi, (_m, b64) =>
    new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))),
  );
}

function headerOf(raw, name) {
  const m = raw.match(new RegExp(`^${name}:\\s*(.*)$`, "mi"));
  return m ? decodeMimeWords(m[1].trim()) : null;
}

/** Everything after the first blank line, decoded when the part is base64. */
function bodyOf(raw) {
  const m = raw.match(/\r?\n\r?\n([\s\S]*)$/);
  const body = m ? m[1] : "";
  if (!/^Content-Transfer-Encoding:\s*base64$/im.test(raw)) return body;
  return new TextDecoder().decode(Uint8Array.from(atob(body.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
}

const sentMessage = (env) => env.CONTACT_EMAIL.send.mock.calls[0][0];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("method guard", () => {
  it("405s a non-POST and advertises Allow: POST", async () => {
    const res = await post({}, { env: makeEnv(), method: "GET" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });
});

describe("rate limiting", () => {
  it("429s over the limit, keyed by CF-Connecting-IP", async () => {
    const env = makeEnv({ RATE_LIMITER: { limit: vi.fn(async () => ({ success: false })) } });
    const siteverify = stubSiteverify();

    const res = await post(VALID, { env });

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, error: "ratelimited" });
    expect(env.RATE_LIMITER.limit).toHaveBeenCalledWith({ key: IP });
    expect(siteverify).not.toHaveBeenCalled();
    expect(env.CONTACT_EMAIL.send).not.toHaveBeenCalled();
  });

  it("fails open when the limiter binding throws", async () => {
    const env = makeEnv({
      RATE_LIMITER: { limit: vi.fn(async () => { throw new Error("binding down"); }) },
    });
    stubSiteverify();

    const res = await post(VALID, { env });

    expect(res.status).toBe(200);
    expect(env.CONTACT_EMAIL.send).toHaveBeenCalledTimes(1);
  });
});

describe("cross-site Origin", () => {
  it.each(["https://bjohnsoncounseling.com", "https://www.bjohnsoncounseling.com"])(
    "accepts a POST from %s",
    async (origin) => {
      const env = makeEnv();
      stubSiteverify();
      const res = await post(VALID, { env, headers: { Origin: origin } });
      expect(res.status).toBe(200);
      expect(env.CONTACT_EMAIL.send).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["https://evil.example", "https://bjohnsoncounseling.pages.dev", "null"])(
    "403s a POST whose Origin is %s, before rate limiting or Turnstile",
    async (origin) => {
      const env = makeEnv();
      const siteverify = stubSiteverify();
      const res = await post(VALID, { env, headers: { Origin: origin } });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ ok: false, error: "verification" });
      expect(env.RATE_LIMITER.limit).not.toHaveBeenCalled();
      expect(siteverify).not.toHaveBeenCalled();
      expect(env.CONTACT_EMAIL.send).not.toHaveBeenCalled();
    },
  );
});

describe("body size", () => {
  it("413s a body declared over the limit without parsing it", async () => {
    const env = makeEnv();
    const siteverify = stubSiteverify();
    const res = await post(VALID, { env, headers: { "Content-Length": String(MAX_BODY_BYTES + 1) } });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ ok: false, error: "malformed" });
    expect(siteverify).not.toHaveBeenCalled();
    expect(env.CONTACT_EMAIL.send).not.toHaveBeenCalled();
  });

  it("accepts a body declared at the limit", async () => {
    const env = makeEnv();
    stubSiteverify();
    const res = await post(VALID, { env, headers: { "Content-Length": String(MAX_BODY_BYTES) } });
    expect(res.status).toBe(200);
  });
});

describe("malformed body", () => {
  it("400s when the body isn't form data", async () => {
    const res = await worker.fetch(
      new Request(BASE + PATH, {
        method: "POST",
        body: "{}",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      }),
      makeEnv(),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "malformed" });
  });
});

describe("honeypot", () => {
  it("is not a field a browser would autofill", () => {
    // Chrome and Safari fill fields whose name or label matches an address or
    // identity heuristic, from a saved profile, regardless of autocomplete="off".
    expect(FIELDS.honeypot).not.toMatch(/company|organi[sz]ation|name|email|phone|address|url|website|title|fax/i);
  });

  it("pretends success and sends nothing when the honeypot is filled", async () => {
    const env = makeEnv();
    const siteverify = stubSiteverify();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await post({ ...VALID, [FIELDS.honeypot]: "i am a bot" }, { env });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(env.CONTACT_EMAIL.send).not.toHaveBeenCalled();
    // Bails before Turnstile too — a bot shouldn't cost a siteverify call.
    expect(siteverify).not.toHaveBeenCalled();
    // The only trace, so a false positive can be spotted in Workers Logs.
    expect(warn).toHaveBeenCalledWith("honeypot tripped");
  });

  it("sends normally when the honeypot is present but empty", async () => {
    const env = makeEnv();
    stubSiteverify();

    const res = await post({ ...VALID, [FIELDS.honeypot]: "" }, { env });

    expect(res.status).toBe(200);
    expect(env.CONTACT_EMAIL.send).toHaveBeenCalledTimes(1);
  });
});

describe("field validation", () => {
  it.each([
    FIELDS.firstName,
    FIELDS.lastName,
    FIELDS.email,
    FIELDS.phone,
    FIELDS.service,
    FIELDS.payment,
    FIELDS.message,
  ])(
    "400s when %s is empty",
    async (field) => {
      const env = makeEnv();
      stubSiteverify();

      const res = await post({ ...VALID, [field]: "" }, { env });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "missing" });
      expect(env.CONTACT_EMAIL.send).not.toHaveBeenCalled();
    },
  );

  it("treats a whitespace-only field as empty", async () => {
    const res = await post({ ...VALID, message: "   \n " }, { env: makeEnv() });
    expect(await res.json()).toEqual({ ok: false, error: "missing" });
  });

  it.each([
    ["no @", "not-an-email"],
    ["no dot in the domain", "ada@example"],
    ["a space", "ada lovelace@example.com"],
    // Characters that mean something in a Reply-To header must not pass through.
    ["angle brackets", "<ada@example.com>"],
    ["a trailing angle bracket", "ada@example.com>"],
    ["a quote", 'ada"@example.com'],
    ["a comma", "ada,bob@example.com"],
    ["parentheses", "ada(comment)@example.com"],
    ["a trailing dot", "ada@example.com."],
  ])("400s on a malformed email: %s", async (_label, email) => {
    const env = makeEnv();
    stubSiteverify();

    const res = await post({ ...VALID, email }, { env });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "email" });
    expect(env.CONTACT_EMAIL.send).not.toHaveBeenCalled();
  });
});

describe("header injection", () => {
  it("collapses CR/LF in a name so it cannot split headers", async () => {
    const env = makeEnv();
    stubSiteverify();

    const res = await post({ ...VALID, lastName: "Lovelace\r\nBcc: evil@example.com" }, { env });

    expect(res.status).toBe(200);
    const raw = rawOf(sentMessage(env));
    // The CRLF became a single space inside the (encoded) subject...
    expect(headerOf(raw, "Subject")).toBe(
      "Website inquiry — Ada Lovelace Bcc: evil@example.com (Individual Counseling)",
    );
    // ...and no Bcc header line was smuggled into the message.
    expect(/^Bcc:/im.test(raw)).toBe(false);
  });

  it("collapses CR/LF in the service, which also reaches the subject", async () => {
    const env = makeEnv();
    stubSiteverify();

    await post({ ...VALID, service: "Couples\r\nBcc: evil@example.com" }, { env });

    expect(/^Bcc:/im.test(rawOf(sentMessage(env)))).toBe(false);
  });

  it("rejects an email carrying CR/LF (collapse makes it fail validation)", async () => {
    const env = makeEnv();
    stubSiteverify();

    const res = await post({ ...VALID, email: "ada@example.com\r\nBcc: evil@example.com" }, { env });

    expect(res.status).toBe(400);
    expect(env.CONTACT_EMAIL.send).not.toHaveBeenCalled();
  });
});

describe("length limits", () => {
  it("truncates a name at the 100-char limit", async () => {
    const env = makeEnv();
    stubSiteverify();

    await post({ ...VALID, firstName: "A".repeat(150) }, { env });

    expect(bodyOf(rawOf(sentMessage(env)))).toContain(`Name:    ${"A".repeat(100)} Lovelace`);
  });

  it("truncates the message at the 5000-char limit", async () => {
    const env = makeEnv();
    stubSiteverify();

    await post({ ...VALID, message: "B".repeat(5_100) }, { env });

    const body = bodyOf(rawOf(sentMessage(env)));
    expect(body).toContain("B".repeat(5_000));
    expect(body).not.toContain("B".repeat(5_001));
  });

  it("keeps newlines in the message body", async () => {
    const env = makeEnv();
    stubSiteverify();

    await post({ ...VALID, message: "Line one\nLine two" }, { env });

    expect(bodyOf(rawOf(sentMessage(env)))).toContain("Line one\nLine two");
  });
});

describe("body encoding", () => {
  // SMTP lines are capped at 998 characters and 7bit bodies can't carry
  // non-ASCII, so the body goes out base64 (wrapped at 76) rather than raw.
  it("sends the body as base64, with no raw line over the SMTP limit", async () => {
    const env = makeEnv();
    stubSiteverify();

    await post({ ...VALID, message: "x".repeat(2_000) }, { env });

    const raw = rawOf(sentMessage(env));
    expect(headerOf(raw, "Content-Transfer-Encoding")).toBe("base64");
    expect(raw.split(/\r?\n/).every((line) => line.length <= 998)).toBe(true);
    expect(bodyOf(raw)).toContain("x".repeat(2_000));
  });

  it("round-trips accents, emoji and CJK", async () => {
    const env = makeEnv();
    stubSiteverify();

    await post({ ...VALID, message: "Café ☕ 你好 🙂" }, { env });

    expect(bodyOf(rawOf(sentMessage(env)))).toContain("Café ☕ 你好 🙂");
  });

  it("truncates the message by characters, not bytes", async () => {
    const env = makeEnv();
    stubSiteverify();

    await post({ ...VALID, message: "é".repeat(MAX.message + 10) }, { env });

    const body = bodyOf(rawOf(sentMessage(env)));
    expect(body).toContain("é".repeat(MAX.message));
    expect(body).not.toContain("é".repeat(MAX.message + 1));
  });
});

describe("Turnstile", () => {
  /** Asserts a rejected submission: 403 "verification", and nothing sent. */
  async function expectRejected(res, env) {
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "verification" });
    expect(env.CONTACT_EMAIL.send).not.toHaveBeenCalled();
  }

  it("403s when siteverify rejects the token", async () => {
    const env = makeEnv();
    stubSiteverify({ success: false, "error-codes": ["invalid-input-response"] });
    await expectRejected(await post(VALID, { env }), env);
  });

  it("403s without calling siteverify when the token is missing", async () => {
    const env = makeEnv();
    const siteverify = stubSiteverify();
    await expectRejected(await post({ ...VALID, "cf-turnstile-response": "" }, { env }), env);
    expect(siteverify).not.toHaveBeenCalled();
  });

  it("403s without calling siteverify when the token is implausibly long", async () => {
    const env = makeEnv();
    const siteverify = stubSiteverify();
    await expectRejected(
      await post({ ...VALID, "cf-turnstile-response": "t".repeat(2049) }, { env }),
      env,
    );
    expect(siteverify).not.toHaveBeenCalled();
  });

  it("403s (fails closed) when siteverify itself throws", async () => {
    const env = makeEnv();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expectRejected(await post(VALID, { env }), env);
  });

  it("403s a token minted for another action", async () => {
    const env = makeEnv();
    stubSiteverify({ success: true, action: "login", hostname: "bjohnsoncounseling.com" });
    await expectRejected(await post(VALID, { env }), env);
  });

  // Only the always-pass test secret returns a verdict without action and
  // hostname. If that secret were ever set in production, honouring such a
  // verdict would let any token from anywhere unlock the form.
  it("403s a verdict without action and hostname", async () => {
    const env = makeEnv();
    stubSiteverify({ success: true });
    await expectRejected(await post(VALID, { env }), env);
  });

  it("accepts a verdict without action and hostname only when TURNSTILE_DEV is set", async () => {
    const env = makeEnv({ TURNSTILE_DEV: "1" });
    stubSiteverify({ success: true });

    const res = await post(VALID, { env });

    expect(res.status).toBe(200);
    expect(env.CONTACT_EMAIL.send).toHaveBeenCalledTimes(1);
  });

  it("403s a token minted on the pages.dev preview", async () => {
    const env = makeEnv();
    stubSiteverify({ success: true, action: "contact", hostname: "bjohnsoncounseling.pages.dev" });
    await expectRejected(await post(VALID, { env }), env);
  });

  it.each(["bjohnsoncounseling.com", "www.bjohnsoncounseling.com"])(
    "accepts a token minted on %s",
    async (hostname) => {
      const env = makeEnv();
      stubSiteverify({ success: true, action: "contact", hostname });

      const res = await post(VALID, { env });

      expect(res.status).toBe(200);
      expect(env.CONTACT_EMAIL.send).toHaveBeenCalledTimes(1);
    },
  );

  it("sends the secret, token and submitter IP to siteverify", async () => {
    const siteverify = stubSiteverify();

    await post(VALID, { env: makeEnv() });

    const [url, init] = siteverify.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(Object.fromEntries(init.body)).toEqual({
      secret: "test-secret",
      response: "tok",
      remoteip: IP,
    });
  });
});

describe("send failure", () => {
  it("500s with the send error when the binding throws", async () => {
    const env = makeEnv({
      CONTACT_EMAIL: { send: vi.fn(async () => { throw new Error("not verified"); }) },
    });
    stubSiteverify();

    const res = await post(VALID, { env });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "send" });
  });
});

describe("JSON vs no-JS response paths", () => {
  it("returns a JSON verdict when Accept: application/json", async () => {
    stubSiteverify();
    const res = await post(VALID, { env: makeEnv() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("303s back to the contact page on success without Accept: application/json", async () => {
    stubSiteverify();
    const res = await post(VALID, { env: makeEnv(), json: false });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(`${BASE}/contact/?submitted=ok`);
  });

  it("303s back with the reason on failure without Accept: application/json", async () => {
    stubSiteverify();
    const res = await post({ ...VALID, email: "nope" }, { env: makeEnv(), json: false });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(`${BASE}/contact/?submitted=error&reason=email`);
  });
});

describe("message shape", () => {
  it("sets the envelope, From, To, Reply-To and Subject", async () => {
    const env = makeEnv();
    stubSiteverify();

    await post(VALID, { env });

    const msg = sentMessage(env);
    expect(msg.from).toBe("contact@bjohnsoncounseling.com");
    expect(msg.to).toBe("inbox@example.com");

    const raw = rawOf(msg);
    expect(headerOf(raw, "From")).toBe("Brandon Johnson Counseling website <contact@bjohnsoncounseling.com>");
    expect(headerOf(raw, "To")).toContain("inbox@example.com");
    // Replying must go to the submitter, not back to the unattended sender.
    expect(headerOf(raw, "Reply-To")).toContain("ada@example.com");
    expect(headerOf(raw, "Subject")).toBe("Website inquiry — Ada Lovelace (Individual Counseling)");
  });

  it("includes every field in the body", async () => {
    const env = makeEnv();
    stubSiteverify();

    await post(VALID, { env });

    const body = bodyOf(rawOf(sentMessage(env)));
    expect(body).toContain("Name:    Ada Lovelace");
    expect(body).toContain("Email:   ada@example.com");
    expect(body).toContain("Phone:   (503) 555-0100");
    expect(body).toContain("Service: Individual Counseling");
    expect(body).toContain("Payment: Out of Pocket");
    expect(body).toContain("Message:\nHello there");
  });

  it("stamps the sender's local time when Cloudflare knows their zone", async () => {
    const env = makeEnv();
    stubSiteverify();

    await post(VALID, { env, cf: { timezone: "America/Los_Angeles" } });

    expect(bodyOf(rawOf(sentMessage(env)))).toMatch(/Sent .* \(sender's local time\)/);
  });

  it.each([
    ["is unknown", undefined],
    ["is invalid", { timezone: "Not/AZone" }],
  ])("falls back to a UTC timestamp when the zone %s", async (_label, cf) => {
    const env = makeEnv();
    stubSiteverify();

    await post(VALID, { env, cf });

    expect(bodyOf(rawOf(sentMessage(env)))).toMatch(/Sent \d{4}-\d{2}-\d{2}T[\d:.]+Z/);
  });
});
