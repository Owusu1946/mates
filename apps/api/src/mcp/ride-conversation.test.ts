import { afterEach, describe, expect, it, vi } from "vitest";
import { executeRideConversation, rideResultReply, ridesEnabled } from "./ride-conversation.js";
import { createSailAdapter, type TripPoint } from "./sail.js";
import { rideCard } from "./ride-card.js";
import { rideHandoff } from "./ride-links.js";

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
    const { run } = setup([
      { places: [{ placeId: "a", name: "Mall A" }, { placeId: "b", name: "Mall B" }] },
      { places: [{ placeId: "airport", name: "Airport" }] },
    ]);
    const result = await executeRideConversation({ from: "Mall", to: "Airport", country: "gh" }, { run });
    expect(result).toMatchObject({ needs: "from", choices: [{ name: "Mall A" }, { name: "Mall B" }] });
    expect(JSON.stringify(result)).not.toContain("placeId");
  });

  it("summarizes quotes without coordinates or untrusted raw error details", async () => {
    const point = { lat: 5.556123, lng: -0.182123 };
    const { run } = setup([
      { places: [{ placeId: "a", name: "Osu" }] },
      { places: [{ placeId: "b", name: "Airport" }] },
      { place: { placeId: "a", name: "Osu", ...point } },
      { place: { placeId: "b", name: "Airport", ...point } },
      { status: "partial", rides: { status: "complete", data: { options: [{ provider: "yango", name: "Economy", price: { amount: 40, currency: "GHS" }, available: true, etaMinutes: 5 }] } }, trotro: { status: "failed", error: { message: "private detail" } } },
    ]);
    const result = await executeRideConversation({ from: "Osu", to: "Airport", country: "gh" }, { run });
    expect(result).toMatchObject({ status: "partial", rides: [{ provider: "yango", price: { amount: 40, currency: "GHS" } }], transit: [] });
    expect(result).not.toHaveProperty("transitStatus");
    expect(JSON.stringify(result)).not.toContain("5.556123");
    expect(JSON.stringify(result)).not.toContain("private detail");
    const card = rideCard({ from: "Osu", to: "Airport", country: "gh" }, result, "Check ride prices from Osu to Airport");
    expect(card).toMatchObject({ kind: "rides", rides: { country: "gh", from: "Osu", to: "Airport" } });
    expect(JSON.stringify(card)).not.toContain("5.556123");
  });

  it("puts resolved route links on the card without adding coordinates to the model result", async () => {
    const from = { lat: 5.55, lng: -0.18, name: "Osu" };
    const to = { lat: 5.60, lng: -0.17, name: "Airport City" };
    const { run } = setup([
      { places: [{ placeId: "a", name: "Osu" }] }, { places: [{ placeId: "b", name: "Airport City" }] },
      { place: { placeId: "a", ...from } }, { place: { placeId: "b", ...to } },
      { options: [
        { provider: "uber", name: "UberX", price: { amount: 38, currency: "GHS" } },
        { provider: "yango", name: "Economy", price: { amount: 35, currency: "GHS" } },
        { provider: "bolt", name: "Economy", price: { amount: 37, currency: "GHS" } },
      ] },
    ]);
    let trip: { from: TripPoint; to: TripPoint } | undefined;
    const result = await executeRideConversation({ from: "Osu", to: "Airport City", country: "gh", mode: "rides" }, { run, onResolvedTrip: (value) => { trip = value; } });
    expect(JSON.stringify(result)).not.toContain("5.55");
    const card = rideCard({}, result, "Compare rides", trip);
    expect(card?.rides?.handoffs).toHaveLength(3);
    const handoffs = Object.fromEntries((card?.rides?.rides ?? []).map((option, index) => [option.provider, card?.rides?.handoffs?.[index]]));
    expect(handoffs.uber?.url).toContain("uber://riderequest");
    expect(handoffs.yango?.url).toContain("yango.go.link/route");
    expect(handoffs.bolt).toMatchObject({ prefilled: false, url: "https://bolt.eu/en/rides/" });
  });

  it("encodes provider routes and rejects invalid or unknown handoffs", () => {
    const from = { lat: 5.55, lng: -0.18, name: "Osu" };
    const to = { lat: 5.60, lng: -0.17, name: "Airport City" };
    const uber = rideHandoff("uber", from, to);
    expect(new URL(uber!.url).searchParams.get("dropoff[nickname]")).toBe("Airport City");
    const yango = rideHandoff("yango", from, to);
    expect(new URL(yango!.url).searchParams.get("end-lat")).toBe("5.6");
    expect(new URL(yango!.url).searchParams.get("adj_fallback")).toContain("gto=-0.17%2C5.6");
    expect(rideHandoff("unknown", from, to)).toBeNull();
    expect(rideHandoff("uber", { ...from, lat: 999 }, to)).toBeNull();
  });

  it("keeps available rides with no price", async () => {
    const point = { lat: 5.6, lng: -0.2 };
    const { run } = setup([
      { places: [{ placeId: "a", name: "Osu" }] }, { places: [{ placeId: "b", name: "Airport" }] },
      { place: { placeId: "a", name: "Osu", ...point } }, { place: { placeId: "b", name: "Airport", ...point } },
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
      { places: [{ placeId: "a", name: "Osu" }] }, { places: [{ placeId: "b", name: "Airport" }] },
      { place: { placeId: "a", name: "Osu", ...point } }, { place: { placeId: "b", name: "Airport", ...point } },
      { options },
    ]);
    const result = await executeRideConversation({ from: "Osu", to: "Airport", country: "gh", mode: "rides" }, { run });
    expect(result).toMatchObject({ rides: Array.from({ length: 8 }, (_, index) => ({ name: `Option ${index + 1}` })), ridesTruncated: true });
    expect(result).not.toHaveProperty("ridesComplete");
  });

  it("includes priced transit steps without exposing ride-connection caveats", async () => {
    const point = { lat: 5.6, lng: -0.2 };
    const { run } = setup([
      { places: [{ placeId: "a", name: "Osu" }] }, { places: [{ placeId: "b", name: "Kaneshie" }] },
      { place: { placeId: "a", name: "Osu", ...point } }, { place: { placeId: "b", name: "Kaneshie", ...point } },
      { network: "trotro", routes: [{ totalFare: 5, currency: "GHS", steps: [{ type: "ride", instruction: "Board at Circle", route: "Circle to Kaneshie", stopCount: 4 }] }], routesRequiringRideConnection: [{}] },
    ]);
    const result = await executeRideConversation({ from: "Osu", to: "Kaneshie", country: "gh", mode: "transit" }, { run });
    expect(result).toMatchObject({ transitNetwork: "trotro", transit: [{ fare: 5, currency: "GHS", steps: [{ route: "Circle to Kaneshie", stopCount: 4 }] }] });
    expect(result).not.toHaveProperty("rideConnectionsAvailable");
  });

  it("builds a short summary from available prices and omits unpriced transit", async () => {
    const point = { lat: 5.6, lng: -0.2 };
    const { run } = setup([
      { places: [{ placeId: "a", name: "Osu" }] }, { places: [{ placeId: "b", name: "Airport" }] },
      { place: { placeId: "a", name: "Osu", ...point } }, { place: { placeId: "b", name: "Airport", ...point } },
      {
        rides: { status: "complete", data: { options: [
          { provider: "Yango", name: "Comfort", price: { amount: 52, currency: "GHS" }, available: true, etaMinutes: 7 },
          { provider: "Yango", name: "Economy", price: { amount: 40, currency: "GHS" }, available: true, etaMinutes: 8 },
        ] } },
        trotro: { status: "complete", data: { network: "trotro", routes: [{ steps: [{ instruction: "Board at Circle" }] }] } },
      },
    ]);
    const result = await executeRideConversation({ from: "Osu", to: "Airport", country: "gh" }, { run });
    expect("provider" in result).toBe(true);
    if (!("provider" in result)) throw new Error("Expected ride summary");
    const reply = rideResultReply(result);
    expect(reply).toContain("Yango Economy has the lowest estimate");
    expect(reply).toContain("pickups around 7–8 min");
    expect(reply).not.toMatch(/trotro|public transport/i);
    expect(result.transit).toEqual([]);
  });

  it("returns a safe message when Sail fails", async () => {
    const result = await executeRideConversation({ from: "Osu", to: "Airport", country: "gh" }, { run: async () => { throw new Error("private detail"); } });
    expect(result).toEqual({ error: "Ride and transit information isn't available right now. Please try again." });
  });
});
