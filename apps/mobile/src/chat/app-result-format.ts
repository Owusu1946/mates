/** Turn raw ISO timestamps in app result metadata into the user's local date and time. */
export function appResultSubtitle(value: string | undefined, locale?: string): string {
  if (!value) return "";
  return value.split(" · ").map((part) => {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(part)) return part;
    const date = new Date(part);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : part;
  }).join(" · ");
}
