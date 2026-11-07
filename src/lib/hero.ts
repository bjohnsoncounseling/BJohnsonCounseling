import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

/**
 * Candidate widths for the full-bleed hero photos. Astro drops any wider than
 * the source and adds the source width back, so a 1000px photo yields 600w and
 * 1000w today and a wider replacement is picked up with no other change.
 */
const widths = [600, 1000, 1600, 2400];

/**
 * Resolves a hero photo once per page, so the `<img>` in the hero and the
 * `<link rel="preload">` in `<head>` name exactly the same files. The hero is
 * the largest contentful paint on every page that has one and nothing else
 * on the page competes with it, so it is fetched eagerly at high priority.
 *
 * The largest candidate doubles as the fallback `src`; without `width` Astro
 * would emit the full-resolution original for it.
 */
export const heroImage = (image: ImageMetadata) =>
  getImage({
    src: image,
    widths,
    width: Math.min(widths.at(-1)!, image.width),
    sizes: '100vw',
    loading: 'eager',
    fetchpriority: 'high',
  });
