import { defineConfig } from "astro/config";

// Static HTML, no client JavaScript unless a component opts in: the landing page should load instantly.
export default defineConfig({
  site: "https://mates.app",
  build: { inlineStylesheets: "always" },
  compressHTML: true,
});
