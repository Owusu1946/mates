import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "../data/sampleCrew.ts";
import { chatFlowReducer, initialFlow, type ChatFlow } from "./chatFlow.logic.ts";
import { answererFor, pinnedOf, quoteOf, regenerableId } from "./messageActions.logic.ts";

const CHAT = "group";
const MESSAGES: Message[] = [
  { id: "m1", author: "me", text: "Ofori or Kumasi?" },
  { id: "m2", author: "akua", text: "Kumasi is GH¢400 cheaper." },
  { id: "m3", author: "esi", text: "Ofori has been on time 6 times." },
];
const start = (messages = MESSAGES): ChatFlow => initialFlow({ [CHAT]: messages }, {});
const run = (state: ChatFlow, ...actions: Parameters<typeof chatFlowReducer>[1][]) => actions.reduce(chatFlowReducer, state);
const finish = (state: ChatFlow) => run(state, { type: "stream", chatId: CHAT }, { type: "tick", chatId: CHAT, words: 50 });
const message = (state: ChatFlow, id: string) => state.messages[CHAT]!.find((candidate) => candidate.id === id)!;

test("a quote is one short line", () => {
  assert.deepEqual(quoteOf({ id: "a", author: "esi", text: "Two\n\nlines  here" }), { id: "a", author: "esi", text: "Two lines here" });
  const long = quoteOf({ id: "b", author: "esi", text: "word ".repeat(60) });
  assert.ok(long.text.length <= 140 && long.text.endsWith("…"));
});

test("replying to a mate in a group: they answer, and your message carries the quote", () => {
  const quote = quoteOf(MESSAGES[1]!);
  assert.equal(answererFor(quote, ["lead", "akua", "esi"], "lead"), "akua");
  assert.equal(answererFor(quote, ["lead", "esi"], "lead"), "lead", "a mate who left the group can't answer");
  assert.equal(answererFor(undefined, ["lead"], "lead"), "lead");

  const sent = run(start(), { type: "reply", chatId: CHAT, quote }, { type: "draft", chatId: CHAT, text: "Even with transport?" }, { type: "send", chatId: CHAT, mateId: "akua", reply: "Yes, transport included." });
  assert.deepEqual(sent.messages[CHAT]!.at(-1)!.replyTo, quote);
  assert.equal(sent.replying[CHAT], undefined, "sending lets the reply go");
  assert.equal(sent.replies[CHAT]!.mateId, "akua");
  assert.equal(run(start(), { type: "reply", chatId: CHAT, quote }, { type: "reply", chatId: CHAT, quote: null }).replying[CHAT], undefined);
});

test("pins and thumbs toggle", () => {
  let state = run(start(), { type: "pin", chatId: CHAT, messageId: "m2" });
  assert.deepEqual(pinnedOf(state.messages[CHAT]!).map((pinned) => pinned.id), ["m2"]);
  state = run(state, { type: "pin", chatId: CHAT, messageId: "m2" });
  assert.deepEqual(pinnedOf(state.messages[CHAT]!), []);

  state = run(state, { type: "rate", chatId: CHAT, messageId: "m3", rating: "up" });
  assert.equal(message(state, "m3").rating, "up");
  assert.equal(message(run(state, { type: "rate", chatId: CHAT, messageId: "m3", rating: "down" }), "m3").rating, "down");
  assert.equal(message(run(state, { type: "rate", chatId: CHAT, messageId: "m3", rating: "up" }), "m3").rating, undefined);
});

test("only the last reply in words can be asked again; the new answer becomes a version", () => {
  assert.equal(regenerableId(MESSAGES), "m3");
  assert.equal(regenerableId([...MESSAGES, { id: "m4", author: "me", text: "Thanks" }]), null);
  assert.equal(regenerableId([{ id: "c", author: "lead", text: "", card: { type: "brief", title: "", rows: [] } }]), null);

  const rated = run(start(), { type: "rate", chatId: CHAT, messageId: "m3", rating: "down" });
  const asked = run(rated, { type: "regenerate", chatId: CHAT, messageId: "m3", reply: "Ofori: 6 for 6 on time." });
  assert.equal(asked.replies[CHAT]!.target, "m3");
  assert.equal(asked.replies[CHAT]!.mateId, "esi", "the same mate answers again");
  const done = finish(asked);
  assert.equal(done.messages[CHAT]!.length, MESSAGES.length, "it replaces in place, not below");
  assert.deepEqual(message(done, "m3").versions, ["Ofori has been on time 6 times.", "Ofori: 6 for 6 on time."]);
  assert.equal(message(done, "m3").version, 1);
  assert.equal(message(done, "m3").rating, undefined, "the thumbs were for the old answer");

  const back = run(done, { type: "version", chatId: CHAT, messageId: "m3", index: 0 });
  assert.equal(message(back, "m3").text, "Ofori has been on time 6 times.");
  assert.equal(run(back, { type: "version", chatId: CHAT, messageId: "m3", index: 5 }), back);
});

test("editing yours takes the chat back to there, and the mate answers again", () => {
  const edited = run(start(), { type: "edit", chatId: CHAT, messageId: "m1", text: "  Ofori, Kumasi or both?  ", mateId: "lead", reply: "Both." });
  assert.deepEqual(edited.messages[CHAT]!.map((kept) => kept.id), ["m1"]);
  assert.equal(message(edited, "m1").text, "Ofori, Kumasi or both?");
  assert.equal(message(edited, "m1").edited, true);
  assert.equal(edited.replies[CHAT]!.full, "Both.");
  const same = start();
  assert.equal(run(same, { type: "edit", chatId: CHAT, messageId: "m2", text: "x", mateId: "lead", reply: "y" }), same, "only yours");
  assert.equal(run(same, { type: "edit", chatId: CHAT, messageId: "m1", text: "  ", mateId: "lead", reply: "y" }), same, "not to nothing");
});

test("a message that didn't go can be sent again", () => {
  const failed = start([...MESSAGES, { id: "m4", author: "me", text: "Ask both", failed: true }]);
  const retried = run(failed, { type: "retry", chatId: CHAT, messageId: "m4", mateId: "lead", reply: "Asking both now." });
  assert.equal(message(retried, "m4").failed, undefined);
  assert.equal(retried.replies[CHAT]!.mateId, "lead");
  assert.equal(run(start(), { type: "retry", chatId: CHAT, messageId: "m1", mateId: "lead", reply: "x" }).replies[CHAT], undefined, "only a failed one");
});
