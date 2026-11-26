import type { ReactNode } from "react";
import { Tooltip } from "../components/ui/Tooltip.tsx";
import type { Source } from "../data/sampleCrew.ts";
import { Favicon } from "./Favicon.tsx";

const shortDomain = (domain: string) => domain.replace(/^www\./, "");

/**
 * A page a mate's reply cites, where it cites it: the site's icon and name in a small pill.
 * Hovering shows the page's title and date; clicking opens it in your browser.
 */
export function CitationChip({ source, href }: { source: Source; href: string }) {
  return (
    <Tooltip
      side="top"
      content={
        <span className="flex flex-col gap-0.5">
          <span className="line-clamp-2 font-medium">{source.title}</span>
          <span className="text-ink-soft">
            {shortDomain(source.domain)}
            {source.published ? ` · ${source.published}` : ""}
          </span>
        </span>
      }
    >
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mx-0.5 inline-flex h-5 max-w-44 items-center gap-1 rounded-full bg-hover-fill px-1.5 align-[-0.25em] text-xs font-medium text-ink-soft no-underline transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Favicon domain={source.domain} src={source.favicon} size={12} />
        <span className="truncate">{shortDomain(source.domain)}</span>
      </a>
    </Tooltip>
  );
}

/** Any other web link, with its site's icon before it (T3 Code's MarkdownExternalLink). */
export function ExternalLink({ href, children }: { href: string | undefined; children: ReactNode }) {
  let host = "";
  try {
    const url = new URL(href ?? "");
    if (url.protocol === "https:" || url.protocol === "http:") host = url.hostname;
  } catch {
    // Not a web address: plain link.
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2 hover:opacity-80">
      {host && <Favicon domain={host} size={13} className="me-1 align-[-0.15em]" />}
      {children}
    </a>
  );
}
