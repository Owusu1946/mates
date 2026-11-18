import { describe, expect, it } from "vitest";
import { AnswerStream, START_AFTER } from "./answer-stream.js";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

function run(deltas: string[], { toolAt = -1, format }: { toolAt?: number; format?: (chunk: string) => string } = {}) {
  const shown: string[] = [];
  const stream = new AnswerStream((chunk) => shown.push(chunk), format);
  deltas.forEach((delta, i) => stream.push(delta, toolAt >= 0 && i >= toolAt));
  return { shown, stream };
}

describe("answer streaming", () => {
  it("streams a long answer a word at a time, then sends the rest when it ends", () => {
    const text = `${words(80)} end`;
    const deltas = text.match(/.{1,7}/gs)!;
    const { shown, stream } = run(deltas);
    expect(shown.length).toBeGreaterThan(5);
    // Every chunk ends between words, so nothing half-written is shown.
    for (const chunk of shown) expect(chunk.endsWith(" ")).toBe(true);
    stream.finish(false);
    expect(shown.join("")).toBe(text);
  });

  it("holds a short reply and sends it whole when the step ends", () => {
    const { shown, stream } = run(["Hi! ", "How can I help?"]);
    expect(shown).toEqual([]);
    stream.finish(false);
    expect(shown).toEqual(["Hi! How can I help?"]);
  });

  it("never shows narration that comes with a tool call", () => {
    const { shown, stream } = run(["Let me check your ", "calendar for today."], { toolAt: 1 });
    stream.finish(true);
    expect(shown).toEqual([]);
  });

  it("never shows a tool call the model wrote out as text", () => {
    const leak = `Sure. to=functions.cooper_memory {"action":"save","text":"${"x".repeat(START_AFTER)}"}`;
    const { shown, stream } = run(leak.match(/.{1,9}/gs)!);
    expect(shown.join("")).not.toContain("to=functions");
    stream.finish(true);
    expect(shown.join("")).not.toContain("to=functions");
  });

  it("finishes a sentence that was already streaming when a tool call arrives, then stops", () => {
    const answer = `${words(40)} and then`;
    const { shown, stream } = run([...answer.match(/.{1,10}/gs)!, " more"], { toolAt: answer.match(/.{1,10}/gs)!.length });
    stream.finish(true);
    expect(shown.join("")).toBe(`${answer} more`);
  });

  it("keeps a citation whole so it can become a link", () => {
    const text = `${words(30)} Accra is the capital [s1][s2] of Ghana.`;
    const deltas = text.match(/.{1,4}/gs)!;
    const { shown, stream } = run(deltas, { format: (chunk) => chunk.replace(/\[(s\d+)\]/g, "<$1>") });
    stream.finish(false);
    expect(shown.join("")).toContain("capital <s1><s2> of Ghana.");
    expect(shown.join("")).not.toMatch(/\[s\d?$|^\d?\]/m);
  });

  it("remembers what was shown, for a retried step", () => {
    const text = `${words(50)} `;
    const { stream } = run(text.match(/.{1,8}/gs)!);
    expect(stream.streamed).toBe(true);
    expect(text.startsWith(stream.shownText)).toBe(true);
  });
});
