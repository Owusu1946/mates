import { BULLET_INDENT, type Shape } from "./scene";

/**
 * A conservative estimate of how much space text takes, used by tests to prove that the longest
 * text the schema allows fits every box. Widths are average glyph widths for Arial/DM Sans as a
 * share of the font size, rounded up, with word wrapping (a word never splits unless it's longer
 * than the line).
 */
const AVERAGE = 0.55;
const BOLD = 0.6;

export function lines(text: string, width: number, size: number, bold = false) {
  const perChar = size * (bold ? BOLD : AVERAGE);
  const fit = Math.max(1, Math.floor(width / perChar));
  let count = 0;
  for (const paragraph of text.split("\n")) {
    let line = 0;
    count += 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const length = word.length;
      if (line === 0) line = length;
      else if (line + 1 + length <= fit) line += 1 + length;
      else {
        count += 1;
        line = length;
      }
      while (line > fit) {
        count += 1;
        line -= fit;
      }
    }
  }
  return count;
}

/** The height a text or list shape needs, in px. */
export function neededHeight(shape: Shape) {
  if (shape.kind === "text") return lines(shape.text, shape.w, shape.size, shape.bold) * shape.size * shape.leading;
  if (shape.kind === "list") {
    const height = shape.items.reduce((sum, item) => sum + lines(item, shape.w - BULLET_INDENT, shape.size) * shape.size * shape.leading, 0);
    return height + shape.gap * Math.max(0, shape.items.length - 1);
  }
  return 0;
}

/** Shapes whose text would overflow their box, for tests and for a last check before rendering. */
export function overflowing(shapes: Shape[]) {
  return shapes.filter((shape) => (shape.kind === "text" || shape.kind === "list") && neededHeight(shape) > shape.h + 0.5);
}
