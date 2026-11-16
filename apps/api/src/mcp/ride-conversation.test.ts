import { afterEach, describe, expect, it, vi } from "vitest";
import { executeRideConversation, ridesEnabled } from "./ride-conversation.js";
import { createSailAdapter } from "./sail.js";
import { rideCard } from "./ride-card.js";

function setup(results: unknown[]) {
  const callTool = vi.fn();
  for (const result of results) callTool.mockResolvedValueOnce(result);
  const sail = createSailAdapter({ callTool });
  return { callTool, run: async <T>(fn: (adapter: typeof sail) => Promise<T>) => fn(sail) };
}

describe("ride conversation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is disabled unless explicitly enabled", () => {
    vi.stubEnv("RIDES_ENABLED", "false");
    expect(ridesEnabled()).toBe(false);
    vi.stubEnv("RIDES_ENABLED", "true");
    expect(ridesEnabled()).toBe(true);
  });
  it("asks for a starting place instead of requesting or guessing location", async () => {
    const { callTool, run } = setup([]);
    expect(await executeRideConversation({ from: "here", to: "Accra Mall", country: "gh" }, { run })).toMatchObject({ needs: "from" });
    expect(callTool).not.toHaveBeenCalled();
  });

  it("offers the location card only when the user explicitly requested their location", async () => {
    const args = { from: "here", to: "Accra Mall", country: "gh" };
    const result = await executeRideConversation(args);
    expect(rideCard(args, result, "Check the fare from here to Accra Mall")).toMatchObject({ kind: "ride_location", rideLocation: { destination: "Accra Mall", country: "gh" } });
    expect(rideCard(args, result, "How much is a ride to Accra Mall?")).toBeUndefined();
    expect(rideCard({ to: "Accra Mall", country: "gh" }, result, "Use my location to get to Accra Mall")).toBeUndefined();
  });

  it("rejects coordinate arguments before offering a location card", async () => {
    const args = { from: "here", to: "5.6, -0.2", country: "gh" };
    const result = await executeRideConversation(args);
    expect(result).toEqual({ error: "Please use a place name or address." });
    expect(rideCard(args, result, "Check the fare from here to the airport")).toBeUndefined();
  });

  it("asks for a country when it is unknown", async () => {
    const { callTool, run } = setup([]);
    expect(await executeRideConversation({ from: "Osu", to: "Accra Mall" }, { run })).toMatchObject({ needs: "country" });
    expect(callTool).not.toHaveBeenCalled();
  });

  it("does not call or meter Sail when the country is missing", async () => {
    const { callTool, run } = setup([]);
    const onSailCall = vi.fn();
    expect(await executeRideConversation({ from: "King's Cross", to: "Heathrow" }, { run, onSailCall })).toMatchObject({ needs: "country" });
    expect(callTool).not.toHaveBeenCalled();
    expect(onSailCall).not.toHaveBeenCalled();
  });

  it("asks the user to clarify when there are multiple place matches", async () => {
    const { run } = setup([{ places: [{ placeId: "a", name: "Mall A" }, { placeId: "b", name: "Mall B" }] }]);
    const result = await executeRideConversation({ from: "Mall", to: "Airport", country: "gh" }, { run });
    expect(result).toMatchObject({ needs: "from", choices: [{ name: "Mall A" }, { name: "Mall B" }] });
    expect(JSON.stringify(result)).not.toContain("placeId");
  });

  it("summarizes quotes without coordinates or untrusted raw error details", async () => {
    const point = { lat: 5.556123, lng: -0.182123 };
    const { run } = setup([
      { places: [{ placeId: "a", name: "Osu" }] },
      { place: { placeId: "a", name: "Osu", ...point } },
      { places: [{ placeId: "b", name: "Airport" }] },
      { place: { placeId: "b", name: "Airport", ...point } },
      { status: "partial", rides: { status: "complete", data: { options: [{ provider: "yango", name: "Economy", price: { amount: 40, currency: "GHS" }, available: true, etaMinutes: 5 }] } }, trotro: { status: "failed", error: { message: "private detail" } } },
    ]);
    const result = await executeRideConversation({ from: "Osu", to: "Airport", country: "gh" }, { run });
    expect(result).toMatchObject({ status: "partial", rides: [{ provider: "yango", price: { amount: 40, currency: "GHS" } }], transitStatus: "failed" });
    expect(JSON.stringify(result)).not.toContain("5.556123");
    expect(JSON.stringify(result)).not.toContain("private detail");
    const card = rideCard({ from: "Osu", to: "Airport", country: "gh" }, result, "Check ride prices from Osu to Airport");
    expect(card).toMatchObject({ kind: "rides", rides: { country: "gh", from: "Osu", to: "Airport" } });
    expect(JSON.stringify(card)).not.toContain("5.556123");
  });

  it("keeps available rides with no price", async () => {
    const point = { lat: 5.6, lng: -0.2 };
    const { run } = setup([
      { places: [{ placeId: "a", name: "Osu" }] }, { place: { placeId: "a", name: "Osu", ...point } },
      { places: [{ placeId: "b", name: "Airport" }] }, { place: { placeId: "b", name: "Airport", ...point } },
      { options: [{ provider: "yango", name: "Economy", available: true }] },
    ]);
    const onSailCall = vi.fn();
    expect(await executeRideConversation({ from: "Osu", to: "Airport", country: "gh", mode: "rides" }, { run, onSailCall })).toMatchObject({ rides: [{ provider: "yango", name: "Economy", price: null }] });
    expect(onSailCall).toHaveBeenCalledTimes(1);
  });

  it("marks display truncation separately from an incomplete provider result", async () => {
    const point = { lat: 5.6, lng: -0.2 };
    const options = Array.from({ length: 9 }, (_, index) => ({ provider: "yango", name: `Option ${index + 1}`, price: { amount: index + 1, currency: "GHS" }, available: true }));
    const { run } = setup([
      { places: [{ placeId: "a", name: "Osu" }] }, { place: { placeId: "a", name: "Osu", ...point } },
      { places: [{ placeId: "b", name: "Airport" }] }, { place: { placeId: "b", name: "Airport", ...point } },
      { options },
    ]);
    const result = await executeRideConversation({ from: "Osu", to: "Airport", country: "gh", mode: "rides" }, { run });
    expect(result).toMatchObject({ rides: Array.from({ length: 8 }, (_, index) => ({ name: `Option ${index + 1}` })), ridesTruncated: true });
    expect(result).not.toHaveProperty("ridesComplete");
  });

  it("includes the transit route and stops and flags ride connections", async () => {
    const point = { lat: 5.6, lng: -0.2 };
    const { run } = setup([
      { places: [{ placeId: "a", name: "Osu" }] }, { place: { placeId: "a", name: "Osu", ...point } },
      { places: [{ placeId: "b", name: "Kaneshie" }] }, { place: { placeId: "b", name: "Kaneshie", ...point } },
      { network: "trotro", routes: [{ totalFare: 5, currency: "GHS", steps: [{ type: "ride", instruction: "Board at Circle", route: "Circle to Kaneshie", stopCount: 4 }] }], routesRequiringRideConnection: [{}] },
    ]);
    expect(await executeRideConversation({ from: "Osu", to: "Kaneshie", country: "gh", mode: "transit" }, { run })).toMatchObject({ transitNetwork: "trotro", rideConnectionsAvailable: true, transit: [{ steps: [{ route: "Circle to Kaneshie", stopCount: 4 }] }] });
  });

  it("returns a safe message when Sail fails", async () => {
    const result = await executeRideConversation({ from: "Osu", to: "Airport", country: "gh" }, { run: async () => { throw new Error("private detail"); } });
    expect(result).toEqual({ error: "Ride and transit information isn't available right now. Please try again." });
  });
});
