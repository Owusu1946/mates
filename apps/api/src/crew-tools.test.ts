import { describe, expect, it } from "vitest";
import { cleanName, createGroupTool, createMateTool, resolveNames, runCreateGroup, runCreateMate, sameRole } from "./crew-tools.js";
import { assembleTeamTool, teamCard } from "./missions.js";

const crew = [
  { id: "lead", name: "Kwabena", role: "companion", isDefault: true },
  { id: "esi", name: "Esi", role: "money", isDefault: false },
  { id: "yaw", name: "Yaw", role: "custom", isDefault: false },
];
const leader = { id: "lead", name: "Kwabena", role: "companion", roleDescription: "", color: "amber", shape: null } as never;

describe("building the crew", () => {
  it("finds a specialist the user already has for a role, never for custom or companion", () => {
    expect(sameRole(crew, "money")?.name).toBe("Esi");
    expect(sameRole(crew, "health")).toBeUndefined();
    expect(sameRole(crew, "custom")).toBeUndefined();
    expect(sameRole(crew, "companion")).toBeUndefined();
  });

  it("resolves group members by name, ignoring case, and reports unknown names", () => {
    const { found, unknown } = resolveNames(crew, ["esi", " YAW ", "Ama"]);
    expect(found.map((m) => m.id)).toEqual(["esi", "yaw"]);
    expect(unknown).toEqual(["Ama"]);
  });

  it("keeps names to what the app allows", () => {
    expect(cleanName("Esi 💰 <CFO>")).toBe("Esi  CFO");
    expect(cleanName("x".repeat(40))).toHaveLength(24);
  });

  it("rejects malformed requests before touching storage", async () => {
    expect(await runCreateMate("user_1", { name: "Esi" })).toMatchObject({ ok: false });
    expect(await runCreateGroup("user_1", leader, { members: ["Esi"] })).toMatchObject({ ok: false });
  });

  it("tells the model which tool is for what", () => {
    expect(createMateTool.function.description).toMatch(/ONE new mate/);
    expect(createMateTool.function.description).toMatch(/does not make a group or start any work/);
    expect(createGroupTool.function.description).toMatch(/No work starts/);
    expect(assembleTeamTool.function.description).toMatch(/Never use it to create one mate/);
  });

  it("marks a talk-only group apart from a mission team", () => {
    const result = { group: { chatId: "group_1", name: "Money & plans" }, members: [{ id: "esi", name: "Esi", role: "money", color: "amber" }] };
    expect(teamCard(result, false).team?.mission).toBe(false);
    expect(teamCard(result).team?.mission).toBe(true);
  });
});
