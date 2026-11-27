import { useState } from "react";
import { cn } from "../lib/utils.ts";
import { logoSrc } from "../settings/apps.logic.ts";
import { MATE_COLORS, MATE_PALETTE } from "../theme/matePalette.ts";

/** The same colour for an app every time, from the mates' palette. */
function tintOf(slug: string) {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MATE_PALETTE[MATE_COLORS[hash % MATE_COLORS.length]!];
}

/** Logos that didn't load this session, so they go straight to the tile next time. */
const failed = new Set<string>();

/**
 * An app's logo from Composio: the one the API gave, otherwise Composio's logo for the slug (cards
 * only carry the slug), loaded through the app (mates://app/logo). If none loads, its first letter
 * on a tile in one of the mates' colours.
 */
export function AppLogo({ name, slug, logo, size = 32, className }: { name: string; slug: string; logo?: string; size?: number; className?: string }) {
  const src = logoSrc(logo ?? `https://logos.composio.dev/api/${encodeURIComponent(slug)}`);
  const [broken, setBroken] = useState(() => !src || failed.has(src));
  const box = { width: size, height: size };
  if (src && !broken)
    return (
      <img
        src={src}
        alt=""
        style={box}
        onError={() => {
          failed.add(src);
          setBroken(true);
        }}
        className={cn("shrink-0 rounded-[28%] bg-white object-contain p-[12%] ring-1 ring-line", className)}
      />
    );
  const [light, mid, deep] = tintOf(slug);
  return (
    <span
      aria-hidden="true"
      style={{ ...box, background: `linear-gradient(135deg, ${light}, ${mid} 55%, ${deep})`, fontSize: size * 0.44 }}
      className={cn("flex shrink-0 items-center justify-center rounded-[28%] font-semibold text-white", className)}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
