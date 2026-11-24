/** Plain-text extraction for previews, including older cards saved with HTML bodies. */
export function emailPreview(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, " ")
    .replace(/<!doctype[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/https?:\/\/[^\s<>]+/gi, " ")
    .replace(/\S{100,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function emailSubtitle(value: string | undefined): string {
  if (!value) return "";
  const parts = value.split(" · ");
  const rawDate = parts.at(-1)!;
  const date = /^\d{4}-\d{2}-\d{2}T/.test(rawDate) ? new Date(rawDate) : null;
  if (date && Number.isFinite(date.getTime())) {
    parts[parts.length - 1] = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  parts[0] = parts[0]!.replace(/\s*<[^>]+>/g, "").trim().replace(/^"(.*)"$/, "$1");
  return parts.join(" · ");
}

/** Older mixed-app lookups saved email rows under the calendar toolkit. */
export function isEmailResult(
  toolkit: string | undefined,
  items: { sourceId: string; subtitle?: string }[],
): boolean {
  if (toolkit === "gmail") return true;
  if (toolkit !== "googlecalendar" || !items.length) return false;
  return items.every(item => /^[a-f0-9]{10,30}$/i.test(item.sourceId))
    && items.filter(item => /<[^>]+@[^>]+>/.test(item.subtitle ?? "")).length > items.length / 2;
}
