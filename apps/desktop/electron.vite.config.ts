import tailwindcss from "@tailwindcss/vite";
import * as NodeURL from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { loadEnv, type Plugin } from "vite";

const page = (name: string) => NodeURL.fileURLToPath(new URL(`src/renderer/${name}.html`, import.meta.url));

/** The scheme and host of a URL from .env, for the CSP; nothing when it isn't set. */
const originOf = (value: string | undefined) => {
  try {
    return value ? new URL(value).origin : "";
  } catch {
    return "";
  }
};

/**
 * The renderer's Content Security Policy, written into index.html. Dev adds what Vite needs for
 * hot reload (its inline React Refresh preamble and the HMR socket); the built app gets the strict one.
 * Signing in adds Clerk's Frontend API (its UI script and requests), its bot check and avatars
 * (@clerk/electron README, Content Security Policy), and our API for everything else.
 */
function contentSecurityPolicy(): Plugin {
  let policy = "";
  return {
    name: "mates-csp",
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || process.cwd(), "VITE_");
      const clerk = env.VITE_CLERK_FRONTEND_API_HOST ? `https://${env.VITE_CLERK_FRONTEND_API_HOST}` : "";
      const api = originOf(env.VITE_API_URL);
      const challenges = "https://challenges.cloudflare.com https://*.protect.clerk.com";
      const strict = [
        "default-src 'self'",
        `script-src 'self' ${clerk} ${challenges}`,
        "style-src 'self' 'unsafe-inline'",
        // Site icons for web citations and sources, from the address the API gives (web-search.ts).
        "img-src 'self' data: https://img.clerk.com https://icons.duckduckgo.com",
        "font-src 'self'",
        `connect-src 'self' ${clerk} ${api} https://*.protect.clerk.com https://clerk-telemetry.com`,
        "worker-src 'self' blob:",
        `frame-src ${challenges}`,
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
      ]
        .map((directive) => directive.replace(/\s+/g, " ").trim())
        .join("; ");
      const serving = config.command === "serve";
      policy = serving ? strict.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws://localhost:*") : strict;
    },
    transformIndexHtml(html) {
      return html.replace("__CSP__", policy);
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
    // apps/desktop/.env (see .env.example), not the renderer folder.
    envDir: NodeURL.fileURLToPath(new URL(".", import.meta.url)),
    // React Compiler, as T3 Code: components and hooks are memoised by the compiler, never by hand.
    plugins: [react({ compiler: true }), tailwindcss(), contentSecurityPolicy()],
    build: {
      outDir: "dist/renderer",
      // Three pages: the app's window, the summon bar that floats over other apps, and the notch.
      rolldownOptions: { input: { index: page("index"), summon: page("summon"), notch: page("notch") } },
    },
  },
});
