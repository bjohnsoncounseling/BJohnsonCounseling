// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Required for correct canonical URLs and sitemap output.
  site: 'https://bjohnsoncounseling.com',
  integrations: [sitemap()],
});
