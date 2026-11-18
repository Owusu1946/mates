/**
 * Where each assistant keeps what it knows about you, and how to ask for it. None of them put
 * memories in their data export, so Mates does what Claude, Gemini and Grok do for imports: a
 * prompt the user runs in the old assistant, whose answer they paste back here.
 */
export type ImportSource = "chatgpt" | "claude" | "gemini" | "grok" | "other";

/**
 * Modelled on Anthropic's published import prompt: everything in one code block (one tap to copy),
 * dated lines so the newer of two conflicting facts wins, and a check that nothing was left out.
 */
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

type Source = {
  id: ImportSource;
  name: string;
  /** Opens the assistant; `prefill` when the link carries the prompt into its message box. */
  url?: (prompt: string) => string;
  prefill: boolean;
  /** One line added to the prompt for what this assistant keeps. */
  extra?: string;
  /** What to do once there. */
  hint: string;
};

export const SOURCES: Source[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    // `prompt` fills the box without sending (`q` would send at once, before the user sees it).
    url: (prompt) => `https://chatgpt.com/?${new URLSearchParams({ prompt })}`,
    prefill: true,
    extra: "Include your saved memories and what you've learned from our chat history.",
    hint: "Send the prompt (paste it if the box is empty). When ChatGPT answers, tap Copy on the code block. Turning on Thinking gives a fuller list.",
  },
  {
    id: "claude",
    name: "Claude",
    url: (prompt) => `https://claude.ai/new?${new URLSearchParams({ q: prompt })}`,
    prefill: true,
    extra: "Write out your memories of me verbatim, exactly as they appear in your memory.",
    hint: "Send the prompt (paste it if the box is empty). When Claude answers, tap Copy on the code block.",
  },
  {
    id: "gemini",
    name: "Gemini",
    // Gemini ignores prompts in links, so the clipboard carries it.
    url: () => "https://gemini.google.com/app",
    prefill: false,
    extra: "Include your saved instructions and what you've learned from our past chats.",
    hint: "Paste the prompt and send it. Memory has to be on in Gemini’s settings. When it answers, tap Copy on the code block.",
  },
  {
    id: "grok",
    name: "Grok",
    url: (prompt) => `https://grok.com/?${new URLSearchParams({ q: prompt })}`,
    prefill: true,
    extra: "Include everything you remember about me.",
    hint: "Send the prompt (paste it if the box is empty). When Grok answers, tap Copy on the code block.",
  },
  {
    id: "other",
    name: "Another assistant",
    prefill: false,
    hint: "Paste the prompt into the assistant you’re coming from, send it, and copy its answer.",
  },
];

export function promptFor(source: Source) {
  return source.extra ? `${BASE_PROMPT}\n\n${source.extra}` : BASE_PROMPT;
}

/** "Imported from ChatGPT", for the Memory screen's source line and group delete. */
export function importedFrom(memorySource: string) {
  if (!memorySource.startsWith("import:")) return null;
  const source = SOURCES.find((item) => item.id === memorySource.slice("import:".length));
  return source ? (source.id === "other" ? "another assistant" : source.name) : "another assistant";
}
