/**
 * Bringing what another assistant knows, as on the phone (apps/mobile/src/memory/import-prompts.ts):
 * the person runs a prompt in the old assistant and pastes its answer back. The preview here is
 * local and line by line; the real one comes from the API (POST /v1/memories/import) later.
 */

export type ImportSource = "chatgpt" | "claude" | "gemini" | "grok" | "other";

type Source = {
  id: ImportSource;
  name: string;
  /** Opens the assistant; `prefill` when the link carries the prompt into its message box. */
  url?: (prompt: string) => string;
  prefill: boolean;
  extra?: string;
  hint: string;
};

const BASE_PROMPT = `I'm moving to another assistant and need to export what you know about me. List every memory you have stored about me, as well as any context you've learned about me from our past conversations.

Output everything in a single code block so I can easily copy it. Format each entry as:
[date saved, if available] - memory content

Cover all of the following, keeping my own words where possible:
- Personal details: name, where I live, family, the people in my life
- Work: job, company, what I do day to day
- Projects, goals and recurring topics
- Tools, apps and languages I use
- Preferences, and instructions I've given you about how to respond (tone, format, "always do X", "never do Y")
- Any other context not covered above

Do not summarise, group or leave out entries. Leave out passwords, PINs and card or account numbers. After the code block, confirm whether that is the complete set.`;

export const SOURCES: Source[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    url: (prompt) => `https://chatgpt.com/?${new URLSearchParams({ prompt })}`,
    prefill: true,
    extra: "Include your saved memories and what you've learned from our chat history.",
    hint: "Send the prompt (paste it if the box is empty). When ChatGPT answers, copy the code block.",
  },
  {
    id: "claude",
    name: "Claude",
    url: (prompt) => `https://claude.ai/new?${new URLSearchParams({ q: prompt })}`,
    prefill: true,
    extra: "Write out your memories of me verbatim, exactly as they appear in your memory.",
    hint: "Send the prompt (paste it if the box is empty). When Claude answers, copy the code block.",
  },
  {
    id: "gemini",
    name: "Gemini",
    url: () => "https://gemini.google.com/app",
    prefill: false,
    extra: "Include your saved instructions and what you've learned from our past chats.",
    hint: "Paste the prompt and send it. Memory has to be on in Gemini's settings. When it answers, copy the code block.",
  },
  {
    id: "grok",
    name: "Grok",
    url: (prompt) => `https://grok.com/?${new URLSearchParams({ q: prompt })}`,
    prefill: true,
    extra: "Include everything you remember about me.",
    hint: "Send the prompt (paste it if the box is empty). When Grok answers, copy the code block.",
  },
  { id: "other", name: "Another assistant", prefill: false, hint: "Paste the prompt into any assistant that remembers you, then copy its answer." },
];

export const sourceOf = (id: ImportSource) => SOURCES.find((source) => source.id === id)!;

export const promptFor = (source: Source) => (source.extra ? `${BASE_PROMPT}\n\n${source.extra}` : BASE_PROMPT);

export const MAX_IMPORT_CHARS = 50_000;

/**
 * The pasted answer as one memory per line: code fences, bullets and leading dates go, and the
 * assistant's closing remarks ("That's the complete set") are left out.
 */
export function previewMemories(answer: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of answer.slice(0, MAX_IMPORT_CHARS).split(/\r?\n/)) {
    const line = raw
      .replace(/^\s*```.*$/, "")
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/^\[[^\]]*\]\s*[-–—:]\s*/, "")
      .trim();
    if (line.length < 4 || /^(that'?s|this is) (the|a) complete/i.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(line);
  }
  return items;
}
