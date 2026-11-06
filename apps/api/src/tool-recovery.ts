type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

/** The end of a JSON object starting at `start`, honouring strings and escapes; -1 if unbalanced. */
function objectEnd(text: string, start: number) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}

const MARKER = /to=functions\.([A-Za-z0-9_]+)/g;
// Typographic quotes appear when the leaked call passes through markdown-like rendering.
const normalise = (json: string) => json.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

/**
 * Some models occasionally write a tool call into their reply as text (`to=functions.NAME …
 * {json}`) instead of calling it. Such a call never runs, and the user sees internals. This
 * turns each one back into a real call for a known tool and removes it from the text.
 */
export function recoverLeakedCalls(text: string, knownTools: Set<string>) {
  if (!text.includes("to=functions.")) return { found: false, text, calls: [] as ToolCall[] };
  const calls: ToolCall[] = [];
  let cleaned = "";
  let cursor = 0;
  for (const match of text.matchAll(MARKER)) {
    if (match.index! < cursor) continue;
    cleaned += text.slice(cursor, match.index);
    const open = text.indexOf("{", match.index! + match[0].length);
    const close = open >= 0 ? objectEnd(text, open) : -1;
    if (close < 0) {
      cursor = text.length;
      break;
    }
    const name = match[1]!;
    try {
      const args = JSON.parse(normalise(text.slice(open, close + 1)));
      if (knownTools.has(name) && args && typeof args === "object")
        calls.push({ id: `recovered_${Date.now()}_${calls.length}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
    } catch { /* Unreadable: drop it; the run retries the step. */ }
    // Leaked calls often trail a few stray characters on the same line.
    const lineEnd = text.indexOf("\n", close);
    const tail = text.slice(close + 1, lineEnd < 0 ? text.length : lineEnd);
    cursor = tail.trim().length <= 24 ? (lineEnd < 0 ? text.length : lineEnd) : close + 1;
  }
  cleaned += text.slice(cursor);
  return { found: true, text: cleaned.replace(/\n{3,}/g, "\n\n").trim(), calls };
}
