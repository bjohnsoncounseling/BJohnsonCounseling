/**
 * Single source of truth for practice details.
 *
 * Everything user-facing — page copy, footer, and the JSON-LD structured data —
 * reads from here. The old Squarespace site kept its address in two places and
 * they drifted: the visible pages said SE Stark Street while the structured data
 * search engines read still said an old Oregon City address. One source prevents
 * a repeat.
 */

import type { ImageMetadata } from 'astro';
import serviceIndividual from '../assets/images/service-individual.jpg';
import serviceTrauma from '../assets/images/service-trauma.jpg';
import serviceCouples from '../assets/images/service-couples.jpg';

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
  /** `abbr` is the post-nominal form (LMFT, LMHC) used wherever the title won't fit. */
  licenses: [
    { title: 'Licensed Marriage & Family Therapist', abbr: 'LMFT', state: 'OR', number: 'T2389' },
    { title: 'Licensed Mental Health Counselor', abbr: 'LMHC', state: 'WA', number: 'LH61514431' },
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
  'Curative',
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
  { label: 'About', href: '/about/' },
  { label: 'My Approach', href: '/my-approach/' },
  { label: 'Services', href: '/services/' },
  { label: 'Who I Am', href: '/who-i-am/' },
  { label: 'Privacy and No Surprises', href: '/privacy-and-no-surprises/' },
  { label: 'Contact', href: '/contact/' },
] as const;

export interface Service {
  title: string;
  image: ImageMetadata;
  /** Written from the photograph itself; the photos are content, not decoration. */
  alt: string;
  /** The Services page description. */
  body: string;
  /** Rendered in bold under the body, for terms that differ from the usual. */
  note?: string;
  /** Private pay only: the form's payment options for it list no insurer. */
  privatePay?: boolean;
}

/**
 * The services offered, in display order. Read by the homepage grid, the
 * Services page and the contact form's "Service Requested" select, so a title
 * can't drift between them (it once read "Trauma Counseling", "Trauma Therapy"
 * and "EMDR/Trauma Therapy" on three surfaces). Couples counseling is listed
 * only while `offerCouplesCounseling` is on.
 *
 * Service imagery is free-licensed (Unsplash / Pexels License, commercial use,
 * no attribution required). It replaces the Squarespace template stock the old
 * site used, whose licence did not travel with us.
 */
export const services: Service[] = [
  {
    title: 'Individual Counseling',
    image: serviceIndividual,
    alt: 'A lone figure in a pale poncho walking through a mossy evergreen forest.',
    body: 'Sometimes individuals reach out wanting to feel better, other times it’s about resolving an issue like challenges in a relationship, and sometimes it’s about seeking to understand yourself and learn how to have a stronger relationship with yourself and your own life. Whether it’s finding purpose and joy in depression, peace in anxiety, resilience from trauma, or pursuing goals or clarity in life, we can do it together.',
  },
  ...(offerCouplesCounseling
    ? [
        {
          title: 'Couples Counseling',
          image: serviceCouples,
          alt: 'Two people holding hands across a wooden table, coffee cups beside them.',
          body: 'Couples sometimes get caught in patterns that push them apart from each other when they wish they were closer. Working through it can be painful or scary, and having someone to guide the process of renewing that closeness and trust can make all the difference. We’ll partner to find freedom from cycles of disconnection, connecting and understanding yourselves and each other, and building new patterns together.',
          note: couplesPaymentNote,
          privatePay: true,
        },
      ]
    : []),
  {
    title: 'Trauma Therapy',
    image: serviceTrauma,
    alt: 'A snow-capped peak catching the first warm light of sunrise above an evergreen ridge.',
    body: "Trauma can leave deep imprints on our lives, often manifesting in ways that disrupt our sense of safety, connection, and self-worth. It can feel overwhelming, but healing is possible. In our work together, we'll create a safe space to explore and understand these experiences, allowing you to reclaim your sense of self and rewrite the narrative of your life. Whether it’s through processing difficult memories, restoring a sense of calm, or finding new pathways to resilience, we'll work together to heal and build a future grounded in strength and hope.",
  },
];

/**
 * srcset widths for the service photos, shared by the homepage grid (cards up
 * to 20rem wide) and the Services page (up to 26rem): 960 covers both at 2x.
 * The largest is also the fallback `src`, so the build never emits the
 * multi-megabyte originals.
 */
export const serviceImageWidths = [320, 640, 960];

/** Options in the contact form's "Service Requested" select. */
export const serviceOptions = [...services.map((s) => s.title), 'Not sure yet'];

/**
 * Options in the contact form's payment select, keyed by the service chosen
 * above it. Insurance applies to individual work only; a private-pay service
 * (couples counseling, see couplesPaymentNote) lists no insurer. "Not sure
 * yet" gets the insured list, since it may turn out to be individual work.
 */
const insuredPaymentOptions = [...insurers, 'Out of Pocket', 'Out of Network', 'Not sure / Other'];
const privatePaymentOptions = ['Out of Pocket', 'Not sure / Other'];

export const paymentOptions: Record<string, string[]> = Object.fromEntries(
  serviceOptions.map((title) => [
    title,
    services.find((s) => s.title === title)?.privatePay ? privatePaymentOptions : insuredPaymentOptions,
  ]),
);

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
