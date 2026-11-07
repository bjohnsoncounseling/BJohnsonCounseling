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
  vite: {
    build: {
      // Astro inlines any bundled <script> under 4 KB straight into the HTML,
      // which would need `script-src 'unsafe-inline'` in public/_headers and
      // so undo most of the CSP. Keep every script an external file; small
      // stylesheets may still be inlined (style-src allows that, and the
      // default 4 KB threshold applies when this returns undefined).
      assetsInlineLimit: (filePath) => (filePath.endsWith('.js') ? false : undefined),
    },
  },
});
