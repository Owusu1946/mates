import react from "@astrojs/react";
import { defineConfig } from "astro/config";

// Static HTML, no client JavaScript unless a component opts in: the landing page should load instantly.
export default defineConfig({
  site: "https://mates.app",
  integrations: [react()],
  build: { inlineStylesheets: "always" },
  compressHTML: true,
  // The mascot is imported from the mobile app; one copy of React for both.
  vite: { resolve: { dedupe: ["react", "react-dom"] } },
});
