/**
 * What a chat's mate is doing because of a reply in progress, for its face and its sidebar line:
 * thinking until words come, working while it writes or runs a step (named by the step), and
 * waiting when the run stopped for you (an approval, a choice, an app to connect). A run that
 * finished or failed leaves nothing to show.
 */

export type LiveChat = { phase: "thinking" | "working" | "waiting"; step?: string };

type Card = { kind?: string; phase?: string; label?: string };

const cards = (content: unknown[]): Card[] =>
  content.flatMap((part) => {
    const value = part as { type?: string; result?: unknown };
    return value?.type === "tool-call" && value.result && typeof value.result === "object" ? [value.result as Card] : [];
  });

const hasWords = (content: unknown[]) => content.some((part) => (part as { type?: string; text?: unknown })?.type === "text" && String((part as { text?: unknown }).text ?? "").trim().length > 0);

export function liveChatOf(content: unknown[], status: string, settled: boolean): LiveChat | null {
  const shown = cards(content).filter((card) => card.kind !== "speaker" && typeof card.label === "string");
  if (settled) {
    if (status !== "waiting") return null;
    const waiting = shown.filter((card) => card.phase === "waiting").at(-1);
    return { phase: "waiting", ...(waiting?.label ? { step: waiting.label } : {}) };
  }
  const step = shown.filter((card) => card.phase === "running").at(-1)?.label;
  if (!hasWords(content) && !step) return { phase: "thinking" };
  return { phase: "working", ...(step ? { step } : {}) };
}
