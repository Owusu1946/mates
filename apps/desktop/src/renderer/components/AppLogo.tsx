import { cn } from "../lib/utils.ts";
import { MATE_COLORS, MATE_PALETTE } from "../theme/matePalette.ts";

/** The same colour for an app every time, from the mates' palette. */
function tintOf(slug: string) {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MATE_PALETTE[MATE_COLORS[hash % MATE_COLORS.length]!];
}

/**
 * An app's logo: Composio's image when there is one, otherwise its first letter on a tile in one
 * of the mates' colours. (Composio's logos load from its CDN, which the page's img-src will need
 * to allow when this is wired up.)
 */
export function AppLogo({ name, slug, logo, size = 32, className }: { name: string; slug: string; logo?: string; size?: number; className?: string }) {
  const box = { width: size, height: size };
  if (logo) return <img src={logo} alt="" style={box} className={cn("shrink-0 rounded-[28%] bg-white object-contain p-[12%] ring-1 ring-line", className)} />;
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
