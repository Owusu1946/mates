import type { Source } from "../data/sampleCrew.ts";

/**
 * Web citations in a mate's reply. The mate cites each page it read by id, `[s1]` or `[s1][s3]`
 * (apps/api/src/web-search.ts). While a reply streams the server turns them into links, but a
 * saved reply keeps the ids. Here both become the same links, so a chat reads the same opened
 * later, and a link to one of the reply's sources draws as a citation.
 */

const CITATION_GROUP = /(?:\[(s\d+)\])+/g;

/**
 * Raw citation ids as links to their pages, the server's way (citeLinks): ids side by side become
 * one run of links, a repeated id shows once, and an id with no page is dropped.
 */
export function linkCitations(text: string, sources: readonly Source[]): string {
  if (!sources.length || !text.includes("[s")) return text;
  const byId = new Map(sources.map((source) => [source.id, source]));
  return text.replace(CITATION_GROUP, (group, _id: string, offset: number, whole: string) => {
    const ids = [...new Set([...group.matchAll(/\[(s\d+)\]/g)].map((match) => match[1]!))];
    const links = ids.flatMap((id) => {
      const source = byId.get(id);
      return source ? [`[${source.domain}](${source.url})`] : [];
    });
    if (!links.length) return "";
    return `${/\s/.test(whole[offset - 1] ?? " ") ? "" : " "}${links.join(" ")}`;
  });
}

/** The same page however the URL was written: no trailing slash, no fragment. */
const samePage = (url: string) => url.replace(/#.*$/, "").replace(/\/+$/, "");

/** The source a link points to, when it's one of the reply's pages. */
export function citationFor(href: string | undefined, sources: readonly Source[]): Source | null {
  if (!href || !sources.length) return null;
  const page = samePage(href);
  return sources.find((source) => samePage(source.url) === page) ?? null;
}

/** The sources a row's cards carry. */
export const sourcesOf = (cards: readonly { type: string }[] | undefined): Source[] =>
  (cards ?? []).flatMap((card) => (card.type === "sources" ? (card as { sources: Source[] }).sources : []));
