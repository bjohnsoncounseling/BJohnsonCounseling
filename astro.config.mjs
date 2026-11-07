// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Required for correct canonical URLs and sitemap output.
  site: 'https://bjohnsoncounseling.com',
  // Pages are built as /about/index.html, and canonical URLs and the sitemap use
  // the slash form, so link that way too; otherwise every nav click is a 308.
  trailingSlash: 'always',
  integrations: [sitemap()],
});
