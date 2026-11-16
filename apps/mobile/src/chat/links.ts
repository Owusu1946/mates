/**
 * Finds links in what someone typed, so the message bubble can show them as links: full URLs
 * ("https://…"), "www." addresses, and bare domains with a common ending ("askorin.app/pricing").
 * Trailing punctuation stays text ("see askorin.app." links "askorin.app"), and an email address is
 * never mistaken for a link.
 */
export type Segment = { text: string; url?: string };

const TLDS = "com|org|net|io|ai|app|dev|co|gh|uk|us|ca|de|fr|ng|ke|za|eu|me|tv|xyz|info|biz|edu|gov|so|sh|gg|ly|to|news|tech|store|site";
const LINK = new RegExp(String.raw`(?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:${TLDS})\b(?:[/?#][^\s<>"']*)?`, "gi");
/** Closing marks that belong to the sentence, not the link. */
const TRAILING = /[.,!?;:'")\]}>]+$/;

/** A link as typed, made openable: "askorin.app" → "https://askorin.app". */
export function hrefOf(link: string) {
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

export function linkify(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const start = match.index ?? 0;
    let link = match[0];
    // Part of an email address ("ken@askorin.app") or a longer word: not a link.
    const before = text[start - 1];
    if (before === "@" || (before && /[\w.-]/.test(before))) continue;
    // Keep a closing bracket that opened inside the link ("…/wiki/Accra_(city)").
    const trailing = TRAILING.exec(link)?.[0] ?? "";
    let cut = trailing.length;
    if (trailing.startsWith(")") && (link.slice(0, -cut).match(/\(/g)?.length ?? 0) > (link.slice(0, -cut).match(/\)/g)?.length ?? 0)) cut -= 1;
    if (cut) link = link.slice(0, -cut);
    if (!link || link.endsWith("://")) continue;
    if (start > last) segments.push({ text: text.slice(last, start) });
    segments.push({ text: link, url: hrefOf(link) });
    last = start + link.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments.length ? segments : [{ text }];
}
