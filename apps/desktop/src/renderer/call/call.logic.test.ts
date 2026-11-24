import assert from "node:assert/strict";
import { test } from "node:test";
import { CAPTION_LIMIT, callReducer, formatCallTime, speakerFor, type CallState } from "./call.logic.ts";

const lines = { kofi: ["Hello."], esi: ["Found it."] };
const you = ["Thanks."];

const live = (memberIds = ["kofi"]): CallState => callReducer(callReducer(null, { type: "start", chatId: "c", memberIds, at: 0 }), { type: "connected", at: 1000 })!;

test("a call connects, then goes live from the moment it connects", () => {
  const ringing = callReducer(null, { type: "start", chatId: "c", memberIds: ["kofi"], at: 0 })!;
  assert.equal(ringing.phase, "connecting");
  assert.equal(callReducer(ringing, { type: "turn", lines, you }), ringing, "nobody talks before it connects");
  const connected = live();
  assert.equal(connected.phase, "live");
  assert.equal(connected.startedAt, 1000);
});

test("turns go round the room, with you every third turn unless you're muted", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((turn) => speakerFor(turn, ["kofi", "esi"], false)), ["kofi", "esi", "me", "kofi", "esi", "me"]);
  assert.deepEqual([0, 1, 2, 3].map((turn) => speakerFor(turn, ["kofi", "esi"], true)), ["kofi", "esi", "kofi", "esi"]);
});

test("each turn adds a caption, and only the latest few stay", () => {
  let state = live(["kofi", "esi"]);
  for (let i = 0; i < 6; i++) state = callReducer(state, { type: "turn", lines, you })!;
  assert.equal(state.captions.length, CAPTION_LIMIT);
  assert.equal(state.captions.at(-1)?.speaker, "me");
  assert.equal(state.speaker, "me");
});

test("muting stops your turn; inviting adds a mate once; ending stops the talk", () => {
  let state = live();
  state = { ...state, speaker: "me" };
  assert.equal(callReducer(state, { type: "mute" })!.speaker, null);
  state = callReducer(state, { type: "invite", mateId: "esi" })!;
  assert.deepEqual(callReducer(state, { type: "invite", mateId: "esi" })!.memberIds, ["kofi", "esi"]);
  const ended = callReducer(state, { type: "end", at: 5000 })!;
  assert.equal(ended.phase, "ended");
  assert.equal(ended.endedAt, 5000);
  assert.equal(callReducer(ended, { type: "close" }), null);
});

test("call time reads like a phone's", () => {
  assert.equal(formatCallTime(7_000), "0:07");
  assert.equal(formatCallTime(760_000), "12:40");
  assert.equal(formatCallTime(3_725_000), "1:02:05");
});
