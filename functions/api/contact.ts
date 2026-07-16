/**
 * Cloudflare Pages Function handling the contact form POST.
 *
 * Deliberately minimal about what it stores: nothing. The submission is
 * forwarded to Brandon by email and not persisted anywhere. The form itself
 * asks people not to include sensitive health details.
 *
 * Required environment variables (set in the Cloudflare Pages dashboard, not
 * in the repo):
 *   RESEND_API_KEY  — Resend API key for sending the notification
 *   CONTACT_TO      — where notifications are delivered
 *   CONTACT_FROM    — a verified sender on your Resend domain
 *   TURNSTILE_SECRET — optional; enables Cloudflare Turnstile verification
 */

interface Env {
  RESEND_API_KEY: string;
  CONTACT_TO: string;
  CONTACT_FROM: string;
  TURNSTILE_SECRET?: string;
}

const MAX = { name: 100, email: 200, phone: 40, service: 60, message: 5000 } as const;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Fails closed on anything that isn't a plausible address. */
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= MAX.email;

function redirect(url: URL, status: 'ok' | 'error', reason?: string) {
  const target = new URL('/contact/', url.origin);
  target.searchParams.set('submitted', status);
  if (reason) target.searchParams.set('reason', reason);
  return Response.redirect(target.toString(), 303);
}

async function verifyTurnstile(token: string | null, secret: string, ip: string | null) {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(url, 'error', 'malformed');
  }

  const get = (k: string, max: number) => (form.get(k)?.toString() ?? '').trim().slice(0, max);

  // Honeypot. Silently accept so bots don't learn they were caught.
  if (get('company', 50)) return redirect(url, 'ok');

  const firstName = get('firstName', MAX.name);
  const lastName = get('lastName', MAX.name);
  const email = get('email', MAX.email);
  const phone = get('phone', MAX.phone);
  const service = get('service', MAX.service);
  const message = get('message', MAX.message);

  if (!firstName || !lastName || !email || !service || !message) return redirect(url, 'error', 'missing');
  if (!isEmail(email)) return redirect(url, 'error', 'email');

  if (env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(
      form.get('cf-turnstile-response')?.toString() ?? null,
      env.TURNSTILE_SECRET,
      request.headers.get('CF-Connecting-IP')
    );
    if (!ok) return redirect(url, 'error', 'verification');
  }

  const name = `${firstName} ${lastName}`;
  const html = `
    <h2>New contact form submission</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(phone || '—')}</p>
    <p><strong>Service requested:</strong> ${escapeHtml(service)}</p>
    <p><strong>Message:</strong></p>
    <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: [env.CONTACT_TO],
        // reply_to means Brandon can just hit reply and reach the person.
        reply_to: email,
        subject: `Website enquiry — ${name} (${service})`,
        html,
      }),
    });

    if (!res.ok) {
      console.error('Resend rejected the send', res.status, await res.text());
      return redirect(url, 'error', 'send');
    }
  } catch (err) {
    console.error('Resend request threw', err);
    return redirect(url, 'error', 'send');
  }

  return redirect(url, 'ok');
};
