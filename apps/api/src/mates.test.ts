import { describe, expect, it } from "vitest";
import { handoffCard, normalisePlan, parseMentions } from "./groups.js";
import { MATE_SHAPES, mateChatId, mateInputSchema, personaPreamble, previewOf, randomShape, ROLE_PRESETS, type PersonaMate } from "./mates.js";

const mate = (id: string, name: string, role = "research", roleDescription = ""): PersonaMate => ({ id, name, role, roleDescription, color: "teal", shape: "hexagon" });
const scout = mate("m1", "Scout", "research");
const ama = mate("m2", "Ama");
const amaLee = mate("m3", "Ama Lee", "money", "a careful money mate");

describe("mates", () => {
  it("accepts a well-formed mate and fills in defaults", () => {
    expect(mateInputSchema.parse({ name: "  Scout " })).toEqual({ name: "Scout", role: "companion", roleDescription: "", color: "teal" });
    expect(mateInputSchema.safeParse({ name: "@scout" }).success).toBe(false);
    for (const shape of MATE_SHAPES) expect(mateInputSchema.parse({ name: "Nova", shape }).shape).toBe(shape);
    expect(mateInputSchema.safeParse({ name: "Nova", shape: "star" }).success).toBe(false);
    expect(mateInputSchema.safeParse({ name: "" }).success).toBe(false);
    expect(mateInputSchema.safeParse({ name: "Scout", color: "neon" }).success).toBe(false);
    expect(mateChatId("abc")).toBe("mate_abc");
  });

  it("introduces the mate, and in a group its fellow mates and its task", () => {
    expect(personaPreamble(scout)).toContain(`You are Scout, ${ROLE_PRESETS.research.brief}`);
    const inGroup = personaPreamble(amaLee, { members: [scout, amaLee], task: "check the budget" });
    expect(inGroup).toContain("You are Ama Lee, a careful money mate");
    expect(inGroup).toContain("fellow mates Scout");
    expect(inGroup).toContain("Your part of this message: check the budget");
    expect(inGroup).not.toContain("fellow mates Ama Lee");
  });

  it("previews the newest message for the sidebar", () => {
    expect(previewOf({ role: "user", content: [{ type: "text", text: "Hi   there" }] })).toEqual({ from: "you", text: "Hi there" });
    expect(previewOf({ role: "assistant", content: [{ type: "text", text: "Sure." }] }, { name: "Scout" })).toEqual({ from: "Scout", text: "Sure." });
    expect(previewOf({ role: "user", content: [], attachments: [{ type: "image", name: "a.jpg" }] }).text).toBe("📷 Photo");
    const group = { role: "assistant", content: [{ type: "tool-call", result: { kind: "speaker", mate: { name: "Ama" } } }, { type: "text", text: "On it" }] };
    expect(previewOf(group)).toEqual({ from: "Ama", text: "On it" });
  });
});

describe("group routing", () => {
  it("finds tagged mates in order, preferring the longest name", () => {
    expect(parseMentions("@Ama Lee and @scout, thoughts?", [scout, ama, amaLee]).map((m) => m.name)).toEqual(["Ama Lee", "Scout"]);
    expect(parseMentions("hey @Ama.", [scout, ama, amaLee]).map((m) => m.name)).toEqual(["Ama"]);
    expect(parseMentions("email me at scout@example.com", [scout])).toEqual([]);
    expect(parseMentions("@Scouts unite", [scout])).toEqual([]);
  });

  it("keeps only real members, and the leader alone when nothing valid remains", () => {
    const members = [scout, ama];
    expect(normalisePlan({ handoff: "Ama, over to you", assignments: [{ mate_id: "m2", task: "budget" }, { mate_id: "ghost", task: "x" }] }, members, "m1", "msg")).toEqual({
      handoff: "Ama, over to you",
      assignments: [{ mateId: "m2", task: "budget" }],
    });
    expect(normalisePlan({ handoff: "ignored", assignments: [{ mate_id: "m1", task: "chat" }] }, members, "m1", "msg").handoff).toBe("");
    expect(normalisePlan({ handoff: "x", assignments: [{ mate_id: "ghost", task: "x" }] }, members, "m1", "msg")).toEqual({ handoff: "", assignments: [{ mateId: "m1", task: "msg" }] });
  });
});

describe("handoff relay", () => {
  it("is running until every assignee has finished, and labelled by round in missions", () => {
    const working = handoffCard(scout, [{ mate: ama, task: "Research", status: "done" }, { mate: amaLee, task: "Price it", status: "working" }], 2);
    expect(working).toMatchObject({ kind: "handoff", phase: "running", label: "Round 2" });
    expect(working.handoff!.items.map((i) => [i.mate.name, i.status])).toEqual([["Ama", "done"], ["Ama Lee", "working"]]);
    expect(working.handoff!.from.gradient).toHaveLength(3);
    expect(handoffCard(scout, [{ mate: ama, task: "x", status: "done" }]).label).toBe("Scout handed off");
    expect(handoffCard(scout, [{ mate: ama, task: "x", status: "waiting" }]).phase).toBe("done");
  });

  it("gives a mate created without a shape a random one of any shape", () => {
    const seen = new Set(Array.from({ length: 600 }, () => randomShape()));
    expect([...seen].sort()).toEqual([...MATE_SHAPES].sort());
  });
});
