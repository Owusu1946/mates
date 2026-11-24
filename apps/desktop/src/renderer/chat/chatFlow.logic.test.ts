import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "../data/sampleCrew.ts";
import { cannedReply, chatFlowReducer, initialFlow, replyStatus, shownText, type ChatFlow } from "./chatFlow.logic.ts";

const card: Message = { id: "c1", author: "lead", text: "", card: { type: "approval", title: "Pay?", detail: "", meta: "", allow: "Pay", state: "open" } };
const start = (): ChatFlow => initialFlow({ chat: [card] }, { chat: true });

function sendHello(state = start()) {
  const drafted = chatFlowReducer(state, { type: "draft", chatId: "chat", text: "  hello  " });
  return chatFlowReducer(drafted, { type: "send", chatId: "chat", mateId: "lead", reply: "On it now" });
}

test("sending adds your message, clears the draft and starts the mate thinking", () => {
  const state = sendHello();
  assert.equal(state.messages.chat?.at(-1)?.text, "hello");
  assert.equal(state.drafts.chat, "");
  assert.deepEqual(state.replies.chat, { chatId: "chat", mateId: "lead", phase: "thinking", full: "On it now", shown: 0 });
});

test("an empty draft, or a reply still coming, sends nothing", () => {
  const empty = start();
  assert.equal(chatFlowReducer(empty, { type: "send", chatId: "chat", mateId: "lead", reply: "x" }), empty);
  const busy = sendHello();
  const again = chatFlowReducer(chatFlowReducer(busy, { type: "draft", chatId: "chat", text: "more" }), { type: "send", chatId: "chat", mateId: "lead", reply: "y" });
  assert.equal(again.messages.chat?.length, busy.messages.chat?.length);
});

test("the reply streams word by word, then becomes a message", () => {
  let state = chatFlowReducer(sendHello(), { type: "stream", chatId: "chat" });
  state = chatFlowReducer(state, { type: "tick", chatId: "chat", words: 1 });
  assert.equal(shownText(state.replies.chat!), "On");
  state = chatFlowReducer(state, { type: "tick", chatId: "chat", words: 1 });
  assert.equal(shownText(state.replies.chat!), "On it");
  state = chatFlowReducer(state, { type: "tick", chatId: "chat", words: 1 });
  assert.equal(state.replies.chat, undefined);
  assert.deepEqual(state.messages.chat?.at(-1), { id: "r1-chat", author: "lead", text: "On it now" });
});

test("stopping keeps what was said; stopping while thinking drops the reply", () => {
  let streaming = chatFlowReducer(chatFlowReducer(sendHello(), { type: "stream", chatId: "chat" }), { type: "tick", chatId: "chat", words: 2 });
  streaming = chatFlowReducer(streaming, { type: "stop", chatId: "chat" });
  assert.equal(streaming.messages.chat?.at(-1)?.text, "On it");
  const thinking = chatFlowReducer(sendHello(), { type: "stop", chatId: "chat" });
  assert.equal(thinking.replies.chat, undefined);
  assert.equal(thinking.messages.chat?.at(-1)?.text, "hello");
});

test("opening a chat clears its unread dot", () => {
  assert.equal(chatFlowReducer(start(), { type: "open", chatId: "chat" }).unread.chat, false);
});

test("answering an approval changes its state", () => {
  const state = chatFlowReducer(start(), { type: "answer", chatId: "chat", messageId: "c1", state: "allowed" });
  const answered = state.messages.chat?.[0]?.card;
  assert.equal(answered?.type === "approval" && answered.state, "allowed");
});

test("canned replies take turns", () => {
  const replies = { lead: ["a", "b"] };
  assert.equal(cannedReply(replies, "lead", 0), "a");
  assert.equal(cannedReply(replies, "lead", 3), "b");
  assert.equal(cannedReply(replies, "nobody", 0), "Got it.");
});

test("a reply in progress shows on its mate: thinking, then working while it streams", () => {
  const thinking = chatFlowReducer(chatFlowReducer(initialFlow({}, {}), { type: "draft", chatId: "c", text: "hi" }), { type: "send", chatId: "c", mateId: "esi", reply: "Hello there" });
  assert.equal(replyStatus(thinking.replies, "esi"), "thinking");
  assert.equal(replyStatus(chatFlowReducer(thinking, { type: "stream", chatId: "c" }).replies, "esi"), "working");
  assert.equal(replyStatus(thinking.replies, "yaw"), null);
});

test("a conversation from the summon bar is added to the end of its chat", () => {
  const added = chatFlowReducer(start(), { type: "append", chatId: "chat", messages: [{ id: "q", author: "me", text: "Hostels?" }, { id: "a", author: "lead", text: "Found 3." }] });
  assert.deepEqual(added.messages.chat!.map((message) => message.id), ["c1", "q", "a"]);
  assert.equal(chatFlowReducer(added, { type: "append", chatId: "chat", messages: [] }), added);
});
