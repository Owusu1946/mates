/**
 * A reply's markdown in blocks, so a streaming reply re-renders only its last block (T3 Code's
 * stream-block splitter, docs/desktop/stack.md): blocks end at a blank line, except inside a code
 * fence, which stays one block however many blank lines it holds, even while it's still open.
 */
export function splitBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const opener = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1];
    if (opener) {
      if (!fence) fence = opener[0]!.repeat(opener.length);
      else if (opener.startsWith(fence)) fence = null;
    }
    if (!fence && !opener && !line.trim()) {
      if (current.length) blocks.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks;
}
