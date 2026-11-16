import { describe, expect, it, vi } from "vitest";
import { createSailAdapter } from "./sail.js";
import { bridgeTools } from "./bridge.js";
import { ridesTool, runRideRequest } from "./rides-tool.js";

const point = { lat: 5.6, lng: -0.2 };

describe("Sail adapter", () => {
  it("makes only the destination mandatory in the model-facing schema", () => {
    expect(ridesTool.function.parameters.required).toEqual(["to"]);
    expect(ridesTool.function.parameters).not.toHaveProperty("$schema");
  });
  it("uses the requested trip tool and excludes unavailable and cargo options", async () => {
    const callTool = vi.fn().mockResolvedValue({ options: [
      { provider: "yango", name: "Economy", available: true },
      { provider: "yango", name: "Cargo", available: true },
      { provider: "yango", name: "Okada", available: false },
    ] });
    const result = await createSailAdapter({ callTool }).planTrip("rides", point, point);
    expect(callTool).toHaveBeenCalledWith("compare_rides", { pickup: point, destination: point });
    expect(result).toMatchObject({ options: [{ provider: "yango", name: "Economy", available: true }] });
  });

  it("rejects invalid coordinates before contacting Sail", async () => {
    const callTool = vi.fn();
    await expect(createSailAdapter({ callTool }).planTrip("best", { lat: 91, lng: 0 }, point)).rejects.toThrow();
    expect(callTool).not.toHaveBeenCalled();
  });

  it("does not accept malformed place results", async () => {
    const callTool = vi.fn().mockResolvedValue({ places: "unexpected" });
    await expect(createSailAdapter({ callTool }).searchPlaces("Accra", "gh")).rejects.toThrow();
  });

  it("accepts search results without coordinates that must be resolved separately", async () => {
    const callTool = vi.fn().mockResolvedValue({ places: [{ placeId: "p1", name: "Accra Mall" }] });
    const result = await createSailAdapter({ callTool }).searchPlaces("Accra Mall", "gh");
    expect(result.places[0]).toMatchObject({ placeId: "p1", name: "Accra Mall" });
  });

  it("filters nested rides while preserving partial transit failures", async () => {
    const callTool = vi.fn().mockResolvedValue({ status: "partial", rides: { status: "complete", data: { options: [
      { provider: "yango", name: "Cargo" }, { provider: "yango", name: "Economy", price: { amount: 40, currency: "GHS" } },
    ] } }, trotro: { status: "failed", error: { code: "timeout" } } });
    const result = await createSailAdapter({ callTool }).planTrip("best", point, point);
    expect(result).toMatchObject({ status: "partial", rides: { data: { options: [{ name: "Economy" }] } }, trotro: { status: "failed" } });
  });

  it("returns a choice instead of guessing between matches", async () => {
    const callTool = vi.fn().mockResolvedValue({ places: [{ placeId: "a", name: "Mall A" }, { placeId: "b", name: "Mall B" }] });
    const result = await runRideRequest(createSailAdapter({ callTool }), { from: { kind: "search", query: "Mall" }, to: { kind: "point", point }, country: "gh", mode: "best" });
    expect(result).toMatchObject({ kind: "place_choice", field: "from", choices: [{ placeId: "a" }, { placeId: "b" }] });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("biases destination search using the known origin", async () => {
    const callTool = vi.fn().mockResolvedValueOnce({ places: [] });
    const result = await runRideRequest(createSailAdapter({ callTool }), { from: { kind: "point", point }, to: { kind: "search", query: "Mall" }, country: "gh", mode: "best" });
    expect(result).toEqual({ kind: "place_not_found", field: "to" });
    expect(callTool).toHaveBeenCalledWith("search_places", { query: "Mall", countryCode: "gh", near: point });
  });

  it("resolves the known destination first to bias an origin search", async () => {
    const callTool = vi.fn().mockResolvedValueOnce({ place: { placeId: "p", name: "Mall", ...point } }).mockResolvedValueOnce({ places: [] });
    const result = await runRideRequest(createSailAdapter({ callTool }), { from: { kind: "search", query: "Osu" }, to: { kind: "selected", placeId: "p" }, country: "gh", mode: "best" });
    expect(result).toEqual({ kind: "place_not_found", field: "from" });
    expect(callTool).toHaveBeenNthCalledWith(2, "search_places", { query: "Osu", countryCode: "gh", near: point });
  });

  it("preserves valid transit when the rides branch is malformed", async () => {
    const callTool = vi.fn().mockResolvedValue({ status: "partial", rides: { status: "complete", data: { options: "bad" }, error: { message: "private" } }, trotro: { status: "complete", data: { network: "trotro", routes: [{ totalFare: 5 }] } } });
    const result = await createSailAdapter({ callTool }).planTrip("best", point, point);
    expect(result).toEqual({ status: "partial", rides: { status: "unavailable" }, trotro: { status: "complete", data: { network: "trotro", routes: [{ totalFare: 5 }] } } });
  });

  it("drops malformed ride options without losing valid prices", async () => {
    const callTool = vi.fn().mockResolvedValue({ options: [{ name: "bad" }, { provider: "yango", name: "Economy", price: { amount: 40, currency: "GHS" } }] });
    expect(await createSailAdapter({ callTool }).planTrip("rides", point, point)).toMatchObject({ options: [{ name: "Economy" }] });
  });

  it("parses a JSON text content block when structured content is absent", async () => {
    const callTool = vi.fn().mockResolvedValue([{ type: "text", text: JSON.stringify({ places: [] }) }]);
    expect(await createSailAdapter({ callTool }).searchPlaces("Accra", "gh")).toEqual({ places: [] });
  });

  it("resolves an explicit place before planning", async () => {
    const callTool = vi.fn().mockResolvedValueOnce({ place: { placeId: "p", name: "Osu", ...point } }).mockResolvedValueOnce({ network: "trotro", routes: [] });
    const result = await runRideRequest(createSailAdapter({ callTool }), { from: { kind: "selected", placeId: "p" }, to: { kind: "point", point }, country: "gh", mode: "transit" });
    expect(result.kind).toBe("trip");
    expect(callTool).toHaveBeenLastCalledWith("plan_public_transport", { pickup: { placeId: "p", name: "Osu", ...point }, destination: point });
  });
});

describe("MCP bridge", () => {
  it("produces bounded unique function names with reverse mapping", () => {
    const tools = [{ name: "a/b", description: "x".repeat(2000), inputSchema: { $schema: "ignored", type: "object" } }, { name: "a?b", inputSchema: { type: "object" } }];
    const { definitions, names } = bridgeTools({ id: "sail", name: "Sail" }, tools);
    expect(definitions[0]!.function.name).not.toBe(definitions[1]!.function.name);
    expect(definitions[0]!.function.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(names.get(definitions[0]!.function.name)).toBe("a/b");
    expect(definitions[0]!.function.description.length).toBe(1000);
    expect(definitions[0]!.function.parameters).toEqual({ type: "object" });
  });
});
