/**
 * Text helpers for what the mates write. Models produce a little more than plain markdown
 * (task boxes, <br>, LaTeX delimiters), which the renderer would otherwise print as symbols.
 */

const FENCE = /^\s*(```|~~~)/;

/** Tidies a reply for the markdown renderer; code blocks are left exactly as written. */
export function prepareMarkdown(text: string): string {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const inTable = /^\s*\|/.test(line);
      return (
        line
          // Task lists: "- [ ] Book venue" reads as a checkbox, not brackets.
          .replace(/^(\s*)[-*+] \[ \] /, "$1- ☐ ")
          .replace(/^(\s*)[-*+] \[[xX]\] /, "$1- ☑ ")
          // A line break inside a table cell would end the row; elsewhere it's a real break.
          .replace(/<br\s*\/?>/gi, inTable ? " " : "  \n")
          .replace(/<\/?(?:b|strong)>/gi, "**")
          .replace(/<\/?(?:i|em)>/gi, "*")
          .replace(/<\/?(?:u|sub|sup|span)[^>]*>/gi, "")
          // Maths isn't typeset here; show the expression without its delimiters.
          .replace(/\\\((.+?)\\\)/g, "$1")
          .replace(/\\\[(.+?)\\\]/g, "$1")
      );
    })
    .join("\n");
}

/** A reply as one line of plain words, for previews: no #, **, pipes, links or list marks. */
export function plainPreview(text: string): string {
  return (
    text
      .split("\n")
      .filter((line) => !FENCE.test(line) && !/^\s*\|?[\s:|-]*-{3,}[\s:|-]*\|?\s*$/.test(line)) // fences, rules, table dividers
      .map((line) =>
        line
          .replace(/^\s*\|(.*?)\|?\s*$/, (_, cells: string) => cells.split("|").map((cell) => cell.trim()).filter(Boolean).join(" · "))
          .replace(/^\s{0,3}#{1,6}(?:\s+|$)/, "") // also a bare "##" left by truncation
          .replace(/^\s*>\s?/, "")
          .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, ""),
      )
      .join(" ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links and images keep their label
      .replace(/!?\[([^\]]*)\]\([^)]*$/, "$1") // a link cut off by truncation
      .replace(/\[s\d+\]/g, "") // source citations
      .replace(/\*\*|__|~~|`/g, "")
      .replace(/(^|[\s(])[*_](?=\S)/g, "$1")
      .replace(/(\S)[*_](?=[\s).,;:!?]|$)/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
  );
}
