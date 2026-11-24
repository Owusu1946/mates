import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";

/**
 * The renderer's Content Security Policy, written into index.html. Dev adds what Vite needs for
 * hot reload (its inline React Refresh preamble and the HMR socket); the built app gets the strict one.
 */
function contentSecurityPolicy(): Plugin {
  const strict = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'";
  const dev = strict.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws://localhost:*");
  let serving = false;
  return {
    name: "mates-csp",
    configResolved(config) {
      serving = config.command === "serve";
    },
    transformIndexHtml(html) {
      return html.replace("__CSP__", serving ? dev : strict);
    },
  };
}

export default defineConfig({
  main: {
    build: { outDir: "dist/main" },
  },
  preload: {
    build: {
      outDir: "dist/preload",
      // Sandboxed preloads can't be ES modules, so this one is CommonJS whatever package.json says.
      rolldownOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } },
    },
  },
  renderer: {
    // React Compiler, as T3 Code: components and hooks are memoised by the compiler, never by hand.
    plugins: [react({ compiler: true }), tailwindcss(), contentSecurityPolicy()],
    build: { outDir: "dist/renderer" },
  },
});
