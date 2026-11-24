import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ selected: [] as unknown[], updated: [] as unknown[], writes: [] as Record<string, unknown>[] }));
vi.mock("./db/client.js", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => db.selected }) }) }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: () => ({ returning: async () => {
      db.writes.push(values);
      return db.updated;
    } }) }) }),
  }),
}));

import { markBriefLineNotUseful, restoreBriefSection, viewMorningBrief } from "./morning-brief.js";

beforeEach(() => { db.selected = []; db.updated = []; db.writes = []; });

describe("morning brief view and feedback storage", () => {
  it("records a first view only when the owned posted brief can be updated", async () => {
    expect(await viewMorningBrief("user-a", "00000000-0000-0000-0000-000000000001")).toBe(false);
    db.updated = [{ id: "brief-a" }];
    expect(await viewMorningBrief("user-a", "00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(db.writes).toHaveLength(2);
    expect(db.writes[1]).toHaveProperty("viewedAt");
  });

  it("rejects missing lines before touching preferences", async () => {
    db.selected = [{ lines: [{ id: "calendar:1", section: "calendar" }] }];
    expect(await markBriefLineNotUseful("user-a", "brief-a", "email:other")).toBe(false);
    expect(db.writes).toEqual([]);
    db.updated = [{ clerkUserId: "user-a" }];
    expect(await markBriefLineNotUseful("user-a", "brief-a", "calendar:1")).toBe(true);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]).toHaveProperty("mutedSections");
  });

  it("restores only the requested section through a database update", async () => {
    db.updated = [{ clerkUserId: "user-a" }];
    expect(await restoreBriefSection("user-a", "calendar")).toBe(true);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]).toHaveProperty("mutedSections");
  });
});
