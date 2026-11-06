/** Fast, cheap default for chat, tool use and browsing. */
export const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL ?? "openai/gpt-5.6-luna";
/** Same family's flagship; used for the rest of a run once the default writes tool calls as text. */
export const FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL ?? "openai/gpt-5.6-sol";
