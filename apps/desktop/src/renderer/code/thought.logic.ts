/**
 * A mate's reasoning as the timeline shows it (T3 Code's reasoning rows): a bold heading line
 * names the thought, the rest is a few paragraphs and lists. While it streams, the words arrive
 * one at a time; settled, the row shows the heading and opens to the whole thought.
 */

export type Inline = { text: string; code?: true; bold?: true };
export type Block = { type: "p"; text: string } | { type: "ol" | "ul"; items: string[] };

const HEADING = /^\s*\*\*([^*\r\n]+)\*\*[ \t]*\r?(?:\n|$)/;

/** The thought's heading, when it opens with one, and the text after it. */
export function splitThought(text: string): { heading: string | null; body: string } {
  const match = HEADING.exec(text);
  return match ? { heading: match[1]!.trim(), body: text.slice(match[0].length).trim() } : { heading: null, body: text.trim() };
}

/**
 * One line for a thought (T3 Code's liveThoughtLine): its heading, or else its first sentence,
 * with the Markdown taken out.
 */
export function thoughtLine(text: string): string {
  const { heading, body } = splitThought(text);
  const plain = (heading ?? body)
    .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, "")
    .replace(/`+|\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (heading !== null) return plain;
  const end = /[.?!:](?=\s)/.exec(plain);
  return end ? plain.slice(0, end.index + 1) : plain;
}

/** Paragraphs, numbered lists and bullet lists, split on blank lines and list markers. */
export function thoughtBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").filter((line) => line.trim());
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length) blocks.push({ type: "p", text: paragraph.join(" ") });
      paragraph = [];
    };
    for (const line of lines) {
      const item = /^\s*(\d+\.|[-*])\s+(.*)$/.exec(line);
      if (!item) {
        paragraph.push(line.trim());
        continue;
      }
      flush();
      const type = item[1]!.endsWith(".") ? "ol" : "ul";
      const last = blocks.at(-1);
      if (last && last.type === type) last.items.push(item[2]!);
      else blocks.push({ type, items: [item[2]!] });
    }
    flush();
  }
  return blocks;
}

/** `code` and **bold** inside a line; an unclosed marker (mid-stream) stays as text. */
export function inlineParts(text: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(/`([^`]+)`|\*\*([^*]+)\*\*/g)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push(match[1] !== undefined ? { text: match[1], code: true } : { text: match[2]!, bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

const pieces = (text: string) => text.split(/(\s+)/).filter(Boolean);

export const wordCount = (text: string) => pieces(text).filter((piece) => !/^\s+$/.test(piece)).length;

/** The first `words` words of the text, keeping its spacing and line breaks. */
export function revealWords(text: string, words: number): string {
  let seen = 0;
  let out = "";
  for (const piece of pieces(text)) {
    const isWord = !/^\s+$/.test(piece);
    if (isWord && seen === words) break;
    if (isWord) seen++;
    out += piece;
  }
  return out.trimEnd();
}
