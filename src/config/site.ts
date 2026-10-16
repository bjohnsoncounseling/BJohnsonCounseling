/**
 * Single source of truth for practice details.
 *
 * Everything user-facing — page copy, footer, and the JSON-LD structured data —
 * reads from here. The old Squarespace site kept its address in two places and
 * they drifted: the visible pages said SE Stark Street while the structured data
 * search engines read still said an old Oregon City address. One source prevents
 * a repeat.
 */

/**
 * Controls the "not accepting new clients" notice on the contact page and the
 * wording of every button that leads there (see `ctaLabels`). Flip this one
 * value and push; the deploy is automatic. (The contact form itself always
 * renders — questions are welcome either way.)
 */
export const acceptingNewClients = true;

/** Shown on the contact page when `acceptingNewClients` is false. */
export const unavailableNotice =
  'I currently do not have availability for new clients. Questions are always welcome, and feel free to check back soon. I wish you well as you explore, and I hope you find the right person for you.';

/**
 * Labels for the buttons and links that lead to the contact page. While the
 * practice is full they invite a question instead of promising a booking.
 * `short` (header, About page) avoids plain "Contact", which would repeat the
 * nav link beside the header button; `long` is for the closing CTA sections.
 */
export const ctaLabels = acceptingNewClients
  ? { short: 'Get started', long: 'Book a Consultation' }
  : { short: 'Get in touch', long: 'Get in Touch' };

/**
 * Shows or hides everything couples-counseling across the site: the service
 * cards on the homepage and Services page, the contact form option, the
 * techniques list, the couples rate and private-pay note on the About page,
 * and the "couples" wording in the bio and meta descriptions. The copy and
 * photo all stay in the codebase — flip this and push to hide or show it all.
 */
export const offerCouplesCounseling = true;

export const site = {
  name: 'Brandon Johnson Counseling',
  url: 'https://bjohnsoncounseling.com',
  /** Keep under ~155 characters or search results truncate the tail. */
  description: offerCouplesCounseling
    ? 'Individual and couples counseling for anyone feeling stuck in a cycle. SE Portland office, plus remote appointments across Oregon and Washington.'
    : 'Individual counseling and trauma therapy for anyone feeling stuck in a cycle. SE Portland office, plus remote appointments across Oregon and Washington.',
} as const;

export const practitioner = {
  name: 'Brandon Johnson',
  pronouns: 'He/Him/His',
  degree: 'MA',
  licenses: [
    { title: 'Licensed Marriage & Family Therapist', state: 'OR', number: 'T2389' },
    { title: 'Licensed Mental Health Counselor', state: 'WA', number: 'LH61514431' },
  ],
} as const;

export const contact = {
  email: 'brandon@bjohnsoncounseling.com',
  phone: '(971) 231-0768',
  phoneHref: '+19712310768',
  fax: '(971) 200-5813',
} as const;

/**
 * The correct address, confirmed by Brandon 2026-07-16. The Squarespace site's
 * structured data claimed 702 John Adams Street, Oregon City — stale, and wrong.
 */
export const address = {
  street: '8514 SE Stark Street',
  city: 'Portland',
  state: 'OR',
  zip: '97216',
  country: 'US',
  neighborhood: 'SE Portland',
} as const;

/** Remote appointments are offered to clients located anywhere in these states. */
export const areaServed = ['Oregon', 'Washington'] as const;

/**
 * Couples counseling is not covered by insurance, so it is private pay only.
 * Shown wherever couples counseling is described or priced.
 */
export const couplesPaymentNote =
  'Couples counseling is not covered by insurance, so I can only accept private (out-of-pocket) payment for it.';

/**
 * In-person and online appointments share one listing: same length, same fee.
 * `note` renders under the body, for terms that differ from the usual.
 */
export const rates: { title: string; body: string; duration: string; price: string; note?: string }[] = [
  {
    title: 'Individual Appointments',
    body: `Appointments for individuals, in person at my ${address.neighborhood} office or online by video. Typically, meetings are weekly or bi-weekly.`,
    duration: '50 mins',
    price: '$175',
  },
  ...(offerCouplesCounseling
    ? [
        {
          title: 'Couples Counseling',
          body: `Appointments for couples, in person at my ${address.neighborhood} office or online by video. Typically, meetings are weekly or bi-weekly.`,
          duration: '60 mins',
          price: '$225',
          note: couplesPaymentNote,
        },
      ]
    : []),
];

export const insurers = [
  'Aetna',
  'Blue Cross/Blue Shield',
  'First Choice Health Network',
  'MODA',
  'Optum',
  'PacificSource',
  'Providence Health Plan',
  'Regence',
  'UMR',
  'UnitedHealthcare/UBH',
] as const;

export const memberships = [
  { name: 'EMDR International Association (EMDRIA)', url: 'https://www.emdria.org/' },
  { name: 'International Society for the Study of Trauma and Dissociation (ISSTD)', url: 'https://www.isst-d.org/' },
  { name: 'Association for Contextual Behavioral Science (ACBS)', url: 'https://contextualscience.org/' },
  { name: 'International Centre for Excellence in Emotionally Focused Therapy (ICEEFT)', url: 'https://iceeft.com/' },
  { name: 'Oregon Counseling Association (ORCA)', url: 'https://or-counseling.org/' },
  { name: 'Portland Center for Emotionally Focused Therapy (PCEFT)', url: 'https://pceft.com/' },
] as const;

export const nav = [
  { label: 'About', href: '/about' },
  { label: 'My Approach', href: '/my-approach' },
  { label: 'Services', href: '/services' },
  { label: 'Who I Am', href: '/who-i-am' },
  { label: 'Privacy and No Surprises', href: '/privacy-and-no-surprises' },
  { label: 'Contact', href: '/contact' },
] as const;

/** Options in the contact form's "Service Requested" select. */
export const serviceOptions = [
  'Individual Counseling',
  ...(offerCouplesCounseling ? ['Couples Counseling'] : []),
  'EMDR/Trauma Therapy',
];

/**
 * Public Cloudflare Turnstile site key for the contact form's spam check. This
 * is the PUBLIC key and is safe to commit; the matching SECRET key lives only
 * on the contact-form Worker as the TURNSTILE_SECRET secret. The Worker rejects
 * any submission without a valid token, so emptying this would break the form.
 * Widget: dashboard → Turnstile → "bjohnsoncounseling contact form" (hostnames
 * bjohnsoncounseling.com and bjohnsoncounseling.pages.dev).
 *
 * For local testing use Turnstile's "always passes" test key,
 * '1x00000000000000000000AA' (it renders on any hostname, including localhost).
 */
export const turnstileSiteKey = '0x4AAAAAAFXGtZHgNXqhyhfl';

/** Turnstile action name; the Worker rejects tokens issued for any other action. */
export const turnstileAction = 'contact';

export const addressOneLine = `${address.street}, ${address.city}, ${address.state} ${address.zip}`;
