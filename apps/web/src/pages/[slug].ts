import type { APIRoute } from "astro";
import { renderPage, type PageDoc } from "@muse-clone/pages";

// A page a mate made and its owner shared: pages.askorin.app/<slug>. Rendered on demand with the
// same renderer the app uses, from the API's public read (no secrets here), and cached at the edge
// for a minute so a busy link costs almost nothing and an update shows within a minute.
export const prerender = false;

const API = import.meta.env.PUBLIC_API_URL ?? "https://mates-production.up.railway.app";

type PublicPage = { doc: PageDoc; mate: { name: string; color: string }; updatedAt: string | null; summary: string | null; url: string };

/** A small, calm page for anything that isn't there, in the site's colours. Never fetches anything. */
function missing(title: string, body: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f8f7f5;color:#0a0a0a;font:400 16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;text-align:center;padding:24px}h1{font-size:22px;margin:0 0 8px}p{color:#6e6e73;margin:0 0 20px}a{color:#0a0a0a;font-weight:600}</style></head>
<body><main><h1>${title}</h1><p>${body}</p><a href="https://agents.askorin.app">Get your own mate</a></main></body></html>`;
  return new Response(html, { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=30" } });
}
const notFound = () => missing("Page not found", "There’s nothing at this address.");
const unavailable = () => missing("This page isn’t available", "Its owner may have stopped sharing it.");

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? "";
  // Page links are 12 characters from an unambiguous alphabet; anything else is just a missing page.
  if (!/^[a-hjkmnp-z2-9]{12}$/.test(slug)) return notFound();
  let page: PublicPage | null = null;
  try {
    const response = await fetch(`${API}/site/pages/${slug}`, { headers: { accept: "application/json" } });
    if (response.status === 404) return unavailable();
    if (!response.ok) throw new Error(`api ${response.status}`);
    page = (await response.json()) as PublicPage;
  } catch {
    return new Response("<!doctype html><title>Try again</title><p>This page couldn’t load. Refresh in a moment.</p>", { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "10" } });
  }
  const html = renderPage(page.doc, {
    mate: page.mate,
    updatedAt: page.updatedAt,
    summary: page.summary,
    pageKey: slug,
    url: page.url,
    image: "https://agents.askorin.app/og.png",
  });
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=86400",
      "x-robots-tag": "noindex, nofollow",
    },
  });
};
