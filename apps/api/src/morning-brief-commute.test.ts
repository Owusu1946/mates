import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ appTool: vi.fn(), runRideRequest: vi.fn() }));
vi.mock("./app-tools.js", () => ({ appConnected: async () => true, appTool: mocks.appTool, findItems: (value: { items: unknown[] }) => value.items }));
vi.mock("./mcp/sail.js", () => ({ withSail: async (fn: (sail: object) => Promise<unknown>) => fn({}) }));
vi.mock("./mcp/rides-tool.js", () => ({ runRideRequest: mocks.runRideRequest }));

import { collectBriefCandidates } from "./morning-brief-sources.js";

const at = new Date("2026-11-23T07:00:00Z");
const event = { id: "meeting-1", summary: "Meeting", location: "Airport City, Accra", htmlLink: "https://calendar.google.com/event/1", start: { dateTime: "2026-11-23T10:00:00Z" }, end: { dateTime: "2026-11-23T11:00:00Z" } };
const trip = { kind: "trip", from: { lat: 5.55, lng: -0.18, name: "Osu" }, to: { lat: 5.60, lng: -0.17, name: "Airport City" }, result: { options: [{ provider: "bolt", name: "Economy", price: { amount: 38, currency: "GHS" }, durationMinutes: 40 }] } };

beforeEach(() => { vi.stubEnv("RIDES_ENABLED", "true"); mocks.appTool.mockReset().mockResolvedValue({ items: [event] }); mocks.runRideRequest.mockReset().mockResolvedValue(trip); });
afterEach(() => vi.unstubAllEnvs());

describe("morning commute", () => {
  it("uses one calendar read and a Sail quote for a timed away meeting", async () => {
    const lines = await collectBriefCandidates("user-1", at, "Africa/Accra", ["calendar", "rides"], "Osu, Accra");
    expect(mocks.appTool).toHaveBeenCalledTimes(1);
    expect(mocks.runRideRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ country: "gh", mode: "rides", from: { kind: "search", query: "Osu, Accra" }, to: { kind: "search", query: "Airport City, Accra" } }));
    expect(lines.find((line) => line.section === "rides")).toMatchObject({ id: "commute:meeting-1", action: { kind: "rides", url: "https://bolt.eu/en/rides/" } });
    expect(lines.find((line) => line.section === "rides")?.text).toContain("Leave by 09:10");
    expect(lines.find((line) => line.section === "rides")?.text).toContain("estimate now");
  });

  it("omits commute without an origin or an unambiguous physical event", async () => {
    expect(await collectBriefCandidates("user-1", at, "Africa/Accra", ["rides"])).toEqual([]);
    expect(mocks.runRideRequest).not.toHaveBeenCalled();
    mocks.appTool.mockResolvedValue({ items: [{ ...event, location: "https://meet.google.com/abc" }] });
    expect(await collectBriefCandidates("user-1", at, "Africa/Accra", ["rides"], "Osu, Accra")).toEqual([]);
    expect(mocks.runRideRequest).not.toHaveBeenCalled();
  });

  it("does not call Sail while rides are disabled", async () => {
    vi.stubEnv("RIDES_ENABLED", "false");
    expect(await collectBriefCandidates("user-1", at, "Africa/Accra", ["rides"], "Osu, Accra")).toEqual([]);
    expect(mocks.appTool).not.toHaveBeenCalled();
    expect(mocks.runRideRequest).not.toHaveBeenCalled();
  });

  it("does not invent a departure time when Sail returns only a price", async () => {
    mocks.runRideRequest.mockResolvedValue({ ...trip, result: { options: [{ provider: "yango", name: "Economy", price: { amount: 35, currency: "GHS" } }] } });
    const lines = await collectBriefCandidates("user-1", at, "Africa/Accra", ["rides"], "Osu, Accra");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).not.toContain("Leave by");
    expect(lines[0]!.action).toMatchObject({ kind: "rides", url: expect.stringContaining("yango.go.link/route") });
  });
});
