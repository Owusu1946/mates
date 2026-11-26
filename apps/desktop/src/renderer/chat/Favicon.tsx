import { memo, useState } from "react";
import { cn } from "../lib/utils.ts";

/** Hosts whose icon didn't load this session, so they go straight to their letter (T3 Code's failedFaviconHosts). */
const failed = new Set<string>();

/** The icon the API names for a page's site (apps/api web-search.ts), the same one the phone shows. */
export const faviconFor = (domain: string) => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;

/**
 * A site's icon, or its first letter when there isn't one: in citations, links and the sources
 * list. Loads lazily and never blocks the text around it.
 */
export const Favicon = memo(function Favicon({ domain, src, size = 14, className }: { domain: string; src?: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(() => failed.has(domain));
  const box = { width: size, height: size };
  if (broken || !domain)
    return (
      <span aria-hidden style={{ ...box, fontSize: Math.max(8, size * 0.62) }} className={cn("inline-flex shrink-0 items-center justify-center rounded-sm bg-hover-fill font-semibold text-ink-soft uppercase leading-none", className)}>
        {domain.replace(/^www\./, "").charAt(0)}
      </span>
    );
  return (
    <img
      src={src ?? faviconFor(domain)}
      alt=""
      aria-hidden
      loading="lazy"
      draggable={false}
      style={box}
      className={cn("inline-block shrink-0 rounded-sm", className)}
      onError={() => {
        failed.add(domain);
        setBroken(true);
      }}
    />
  );
});
