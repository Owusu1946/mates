import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import { defineConfig } from "astro/config";

// Static HTML, no client JavaScript unless a component opts in: the landing page should load instantly.
// One route renders on demand on Vercel: a shared page at pages.askorin.app/<slug> (src/pages/[slug].ts).
export default defineConfig({
  site: "https://agents.askorin.app",
  integrations: [react()],
  adapter: vercel(),
  build: { inlineStylesheets: "always" },
  compressHTML: true,
  vite: {
    // One copy of React for the site and the shared mascot package.
    resolve: { dedupe: ["react", "react-dom"] },
    // iPhone 7 tops out at iOS 15: ship syntax and CSS (with -webkit- prefixes) Safari 14 reads.
    build: { target: "safari14", cssTarget: "safari14" },
  },
});
