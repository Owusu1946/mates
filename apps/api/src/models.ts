/** Fast, cheap default for chat, tool use and browsing. */
export const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL ?? "openai/gpt-5.6-luna";
/** Same family's flagship; used for the rest of a run once the default writes tool calls as text. */
export const FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL ?? "openai/gpt-5.6-sol";
/** The coding agent on the mates' computer; the flagship, since a weak change costs a whole PR. */
export const CODE_MODEL = process.env.OPENROUTER_CODE_MODEL ?? FALLBACK_MODEL;
/**
 * The mate driving the desktop. Anthropic's models lead the computer-use benchmarks (OSWorld 2.1,
 * November 2026); routine steps use Sonnet, and a step that fails twice escalates to Opus. Check
 * the OpenRouter slugs when they change.
 */
export const COMPUTER_MODEL = process.env.OPENROUTER_COMPUTER_MODEL ?? "anthropic/claude-sonnet-5.5";
export const COMPUTER_HARD_MODEL = process.env.OPENROUTER_COMPUTER_HARD_MODEL ?? "anthropic/claude-opus-5.5";
