/**
 * The contract between the contact form (src/components/ContactForm.astro,
 * built into the static site on Pages) and its backend (workers/contact-form,
 * deployed separately). The two share no other code, so a renamed field or an
 * unknown error code would otherwise only show up as inquiries that never
 * arrive, or as a blank error banner. Both import this file, and
 * test/built-site.test.mjs checks the built HTML against it.
 *
 * Plain ESM with no dependencies: the Worker bundles it with esbuild, Astro
 * bundles it into the page script, and Node imports it in the tests.
 */

/** Form field names: the `name` attributes the page sends and the keys the Worker reads. */
export const FIELDS = {
  firstName: 'firstName',
  lastName: 'lastName',
  email: 'email',
  phone: 'phone',
  service: 'service',
  payment: 'payment',
  message: 'message',
  /**
   * Honeypot: hidden from people, filled by bots. The name is chosen to match
   * no browser autofill heuristic. It used to be `company`, which Chrome and
   * Safari can fill from a saved address profile, so a real person's inquiry
   * could be dropped as a bot's.
   */
  honeypot: 'leave_blank',
  /** Inserted by the Turnstile widget; verified server-side. */
  turnstile: 'cf-turnstile-response',
};

/** Longest accepted value per field: the page sets `maxlength`, the Worker truncates. */
export const MAX = { name: 100, email: 200, phone: 40, service: 60, payment: 60, message: 5000 };

/**
 * A request body declared larger than this is refused before it is parsed.
 * Every field at MAX, plus a Turnstile token and multipart framing, is well
 * under 16 KB.
 */
export const MAX_BODY_BYTES = 64 * 1024;

/**
 * Error codes the Worker can answer with (`{ ok: false, error }` for fetch, or
 * `?submitted=error&reason=` on the no-JS redirect), each with the message the
 * page shows for it.
 */
export const ERRORS = {
  missing: 'Please fill in every required field.',
  email: 'That email address doesn’t look right — please check it.',
  verification: 'We couldn’t verify that you’re human. Please try again.',
  ratelimited: 'That’s a few messages in a short time. Please wait a minute and try again.',
  send: 'Something went wrong on our end and the message wasn’t sent.',
  malformed: 'Something went wrong with that submission. Please try again.',
};
