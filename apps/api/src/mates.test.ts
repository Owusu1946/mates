import { describe, expect, it } from "vitest";
import { collaborationAssignments, directCollaborationPlan, directCollaborationRoster, handoffCard, normalisePlan, parseMentions, queuedSpeaker, stripSpeakerPrefix, visibleMentionText, withQueuedSpeakers } from "./groups.js";
import { DAY_NAMES, dayName, leaderSetupSchema, MATE_SHAPES, mateChatId, mateInputSchema, personaPreamble, previewOf, randomShape, ROLE_PRESETS, type PersonaMate } from "./mates.js";

const mate = (id: string, name: string, role = "research", roleDescription = ""): PersonaMate => ({ id, name, role, roleDescription, color: "teal", shape: "hexagon" });
const scout = mate("m1", "Scout", "research");
const ama = mate("m2", "Ama");
const amaLee = mate("m3", "Ama Lee", "money", "a careful money mate");

describe("mates", () => {
  it("accepts a well-formed mate and fills in defaults", () => {
    expect(mateInputSchema.parse({ name: "  Scout " })).toEqual({ name: "Scout", role: "companion", roleDescription: "", color: "teal" });
    expect(mateInputSchema.safeParse({ name: "@scout" }).success).toBe(false);
    for (const shape of MATE_SHAPES) expect(mateInputSchema.parse({ name: "Nova", shape }).shape).toBe(shape);
    expect(mateInputSchema.parse({ name: "Nova", shape: "star" }).shape).toBe("star");
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

  it("keeps a direct chat with its primary mate unless someone else or Chief of Staff is tagged", () => {
    expect(directCollaborationPlan("check the fare", scout.id, [scout, ama])).toBeNull();
    expect(directCollaborationPlan("@Scout, you take this", scout.id, [scout, ama])).toBeNull();
    expect(directCollaborationPlan("@Ama, what does this cost?", scout.id, [scout, ama])?.mentioned.map((m) => m.id)).toEqual(["m2"]);
    expect(directCollaborationPlan("ask @Chief of Staff", scout.id, [scout, ama])).toMatchObject({ chief: true, mentioned: [] });
    // One mate asked: that mate's answer is the reply; nobody adds a second one.
    expect(collaborationAssignments([ama], scout.id).assignments.map((a) => a.mateId)).toEqual(["m2"]);
    // Two or more: they answer, then the chat's own mate adds one short takeaway.
    expect(collaborationAssignments([ama, amaLee], scout.id).assignments).toEqual([
      { mateId: "m2", task: "" },
      { mateId: "m3", task: "" },
      { mateId: "m1", task: "Combine their answers into one short takeaway" },
    ]);
  });

  it("drops a reply's opening when it speaks as another mate", () => {
    expect(stripSpeakerPrefix("Ama: Hello again! 👋 What can I help with?", ["Ama"])).toBe("Hello again! 👋 What can I help with?");
    expect(stripSpeakerPrefix("**Ama Lee:** Here's the budget.", ["Ama Lee"])).toBe("Here's the budget.");
    expect(stripSpeakerPrefix("ama:   hi", ["Ama"])).toBe("hi");
    // Only a leading name and colon of someone else; names in the middle and the speaker's own text stay.
    expect(stripSpeakerPrefix("I agree with Ama: cut transport first.", ["Ama"])).toBe("I agree with Ama: cut transport first.");
    expect(stripSpeakerPrefix("Note: rent is due Friday.", ["Ama"])).toBe("Note: rent is due Friday.");
    expect(stripSpeakerPrefix("Ama: hi", [])).toBe("Ama: hi");
    expect(stripSpeakerPrefix("A.B: hi", ["A.B"])).toBe("hi");
  });

  it("gives later mates earlier answers as context, never as a script in someone's voice", () => {
    const brief = personaPreamble(scout, { members: [scout, ama], task: "Combine their answers into one short takeaway", earlier: [{ name: "Ama", text: "Cut transport by GH₵200." }] });
    expect(brief).toContain("Earlier in this message: Ama answered: “Cut transport by GH₵200.”");
    expect(brief).toContain("never write as them or start with anyone's name");
    expect(personaPreamble(scout, { members: [scout, ama] })).not.toContain("Earlier in this message");
  });

  it("mentions up to three other mates, and leaves app names and unknown mates alone", () => {
    const nova = mate("m4", "Nova");
    const io = mate("m5", "Io");
    const owned = [scout, ama, amaLee, nova, io];
    expect(directCollaborationPlan("@Ama @Ama Lee @Nova @Io please", scout.id, owned)?.mentioned.map((m) => m.id)).toEqual(["m2", "m3", "m4"]);
    expect(directCollaborationPlan("@Chief of Staff, ask @Ama", scout.id, owned)).toMatchObject({ chief: true, mentioned: [expect.objectContaining({ id: "m2" })] });
    expect(directCollaborationPlan("@Ama check @Slack and @Web", scout.id, owned)?.mentioned.map((m) => m.id)).toEqual(["m2"]);
    expect(directCollaborationPlan("ask @Slack to book it", scout.id, owned)).toBeNull();
    expect(directCollaborationPlan("@Ghost, are you there?", scout.id, owned)).toBeNull();
  });

  it("keeps an ordinary direct chat and an ordinary resume on the primary mate", () => {
    const attached = [scout, ama];
    expect(directCollaborationRoster({ resume: false, hasGroupQueue: false, leader: scout, attached, plan: null })).toBeNull();
    expect(directCollaborationRoster({ resume: true, hasGroupQueue: false, leader: scout, attached, plan: null })).toBeNull();
    expect(directCollaborationRoster({ resume: true, hasGroupQueue: true, leader: scout, attached, plan: null })).toEqual(attached);
    expect(directCollaborationRoster({
      resume: false,
      hasGroupQueue: false,
      leader: scout,
      attached,
      plan: { mentioned: [amaLee] },
    })?.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("routes a picked mention by id when two mates share a name", () => {
    const first = mate("8f4e4120-2958-49ae-aa6f-e4242713dc60", "Ama");
    const second = mate("1c0b9a2e-6d4f-4a1b-9c33-0e5d7a8b6c21", "Ama");
    expect(directCollaborationPlan(`@Ama{${second.id}} what does this cost?`, scout.id, [scout, first, second])?.mentioned.map((m) => m.id)).toEqual([second.id]);
    expect(visibleMentionText(`Ask @Ama{${second.id}} today`)).toBe("Ask @Ama today");
  });

  it("finishes a waiting turn as the removed mate and never substitutes the primary mate", () => {
    const removed = mate("8f4e4120-2958-49ae-aa6f-e4242713dc60", "Ama");
    const room = withQueuedSpeakers([scout], [removed.id, "missing"], [scout, removed]);
    expect(room.map((m) => m.id)).toEqual(["m1", removed.id]);
    expect(queuedSpeaker(room, removed.id)?.id).toBe(removed.id);
    expect(queuedSpeaker([scout], removed.id)).toBeNull();
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

  it("never lets the leader take on work while it has teammates", () => {
    const members = [scout, ama, amaLee];
    const plan = normalisePlan({ needs_work: true, handoff: "On it", assignments: [{ mate_id: "m1", task: "price it" }] }, members, "m1", "Work out a careful money budget");
    expect(plan.assignments).toEqual([{ mateId: "m3", task: "Work out a careful money budget" }]);
    // Conversation stays with the leader.
    expect(normalisePlan({ needs_work: false, handoff: "", assignments: [{ mate_id: "m1", task: "say thanks" }] }, members, "m1", "thanks!").assignments).toEqual([{ mateId: "m1", task: "say thanks" }]);
  });
});

describe("handoff relay", () => {
  it("is running until every assignee has finished, and labelled by round in missions", () => {
    const working = handoffCard(scout, [{ mate: ama, task: "Research", status: "done" }, { mate: amaLee, task: "Price it", status: "working" }], 2);
    expect(working).toMatchObject({ kind: "handoff", phase: "running", label: "Round 2" });
    expect(working.handoff!.items.map((i) => [i.mate.name, i.status])).toEqual([["Ama", "done"], ["Ama Lee", "working"]]);
    expect(working.handoff!.from.gradient).toHaveLength(3);
    expect(handoffCard(scout, [{ mate: ama, task: "x", status: "done" }]).label).toBe("Scout handed off");
    // Mates the user tagged: "You asked …", and the card says so for the app.
    const asked = handoffCard(scout, [{ mate: ama, task: "", status: "done" }, { mate: amaLee, task: "", status: "working" }, { mate: scout, task: "Combine their answers into one short takeaway", status: "queued" }], undefined, true);
    expect(asked.label).toBe("You asked Ama and Ama Lee");
    expect(asked.handoff!.asked).toBe(true);
    expect(handoffCard(scout, [{ mate: ama, task: "", status: "done" }], 3, true).handoff!.asked).toBeUndefined();
    expect(handoffCard(scout, [{ mate: ama, task: "x", status: "waiting" }]).phase).toBe("done");
  });

  it("names a new lead mate for the day it arrives, in Akan", () => {
    // 2026-11-08 was a Sunday.
    const days = Array.from({ length: 7 }, (_, i) => dayName(new Date(Date.UTC(2026, 10, 8 + i, 12))));
    expect(days).toEqual(["Kwesi", "Kojo", "Kwabena", "Kweku", "Yaw", "Kofi", "Kwame"]);
    expect(DAY_NAMES).toHaveLength(7);
  });

  it("needs a name, shape and colour to set up the lead mate", () => {
    expect(leaderSetupSchema.parse({ name: " Kojo ", shape: "cloud", color: "blue" })).toEqual({ name: "Kojo", shape: "cloud", color: "blue" });
    expect(leaderSetupSchema.safeParse({ name: "Kojo", shape: "cloud" }).success).toBe(false);
    expect(leaderSetupSchema.parse({ name: "Kojo", shape: "star", color: "blue" }).shape).toBe("star");
    expect(leaderSetupSchema.safeParse({ name: "@kojo", shape: "cloud", color: "blue" }).success).toBe(false);
  });

  it("gives a mate created without a shape a random one of any shape", () => {
    const seen = new Set(Array.from({ length: 600 }, () => randomShape()));
    expect([...seen].sort()).toEqual([...MATE_SHAPES].sort());
  });
});
