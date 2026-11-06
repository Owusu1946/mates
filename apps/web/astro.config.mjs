import react from "@astrojs/react";
import { defineConfig } from "astro/config";

// Static HTML, no client JavaScript unless a component opts in: the landing page should load instantly.
export default defineConfig({
  site: "https://agents.askorin.app",
  integrations: [react()],
  build: { inlineStylesheets: "always" },
  compressHTML: true,
  vite: {
    // One copy of React for the site and the shared mascot package.
    resolve: { dedupe: ["react", "react-dom"] },
    // iPhone 7 tops out at iOS 15: ship syntax and CSS (with -webkit- prefixes) Safari 14 reads.
    build: { target: "safari14", cssTarget: "safari14" },
  },
});
