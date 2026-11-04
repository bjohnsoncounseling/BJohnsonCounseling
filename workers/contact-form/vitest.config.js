import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

// Tests run inside workerd (via Cloudflare's Vitest plugin) so `cloudflare:email`
// and EmailMessage resolve for real rather than being stubbed out, and a
// mimetext or wrangler bump that breaks the Workers build fails here.
//
// wrangler.toml is loaded for its compatibility date and module resolution only.
// The tests call `worker.fetch(request, env)` with a hand-built env, so no real
// send_email or ratelimit binding is ever provisioned — see test/index.test.js.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.toml" } })],
});
