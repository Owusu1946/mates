/**
 * Command output with its colours, as text spans (T3 Code's terminalOutputSpans). Only the
 * SGR codes test runners and package managers use are kept; colours become theme tokens so the
 * output follows Light, Dark and the theme.
 */

export type Tone = "red" | "green" | "yellow" | "blue" | "dim";
export type Span = { text: string; tone: Tone | null; bold: boolean };

const TONE_FOR: Record<number, Tone> = { 31: "red", 32: "green", 33: "yellow", 34: "blue", 35: "blue", 36: "blue", 90: "dim", 91: "red", 92: "green", 93: "yellow", 94: "blue", 96: "blue" };

// ESC [ codes m
const SGR = /\u001b\[([\d;]*)m/g;

export function ansiSpans(text: string): Span[] {
  const spans: Span[] = [];
  let tone: Tone | null = null;
  let bold = false;
  let last = 0;
  const push = (chunk: string) => {
    if (!chunk) return;
    const previous = spans.at(-1);
    if (previous && previous.tone === tone && previous.bold === bold) previous.text += chunk;
    else spans.push({ text: chunk, tone, bold });
  };
  for (const match of text.matchAll(SGR)) {
    push(text.slice(last, match.index));
    last = match.index + match[0].length;
    for (const code of (match[1] || "0").split(";").map(Number)) {
      if (code === 0) {
        tone = null;
        bold = false;
      } else if (code === 1) bold = true;
      else if (code === 2) tone = "dim";
      else if (code === 22) bold = false;
      else if (code === 39) tone = null;
      else if (TONE_FOR[code]) tone = TONE_FOR[code]!;
    }
  }
  push(text.slice(last));
  return spans;
}
