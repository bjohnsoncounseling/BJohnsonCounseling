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
 * Controls the "not accepting new clients" notice, the CTA wording, and whether
 * the contact form renders. Flip this one value and push; the deploy is automatic.
 */
export const acceptingNewClients = false;

/** Shown on the contact page when `acceptingNewClients` is false. */
export const unavailableNotice =
  'I currently do not have availability for new clients. Questions are always welcome, and feel free to check back soon. I wish you well as you explore, and I hope you find the right person for you.';

export const site = {
  name: 'Brandon Johnson Counseling',
  url: 'https://bjohnsoncounseling.com',
  /** Keep under ~155 characters or search results truncate the tail. */
  description:
    'Individual, couples, and family counseling for anyone feeling stuck in a cycle. SE Portland office, plus remote appointments across Oregon and Washington.',
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

export const rates = [
  {
    title: '50-minute Online Appointment',
    body: 'Online appointments for couples, individuals, and families. Typically, meetings are weekly or bi-weekly.',
    duration: '50 mins',
    price: '$175',
  },
  {
    title: 'In-person Appointments',
    body: 'Office appointments for couples, individuals, and families. Typically, meetings are weekly or bi-weekly.',
    duration: '50 mins',
    price: '$175',
  },
] as const;

export const insurers = [
  'OHP CareOregon',
  'OHP Trillium',
  'OHP Open Card',
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
  'Couples Counseling',
  'EMDR/Trauma Therapy',
] as const;

export const addressOneLine = `${address.street}, ${address.city}, ${address.state} ${address.zip}`;
