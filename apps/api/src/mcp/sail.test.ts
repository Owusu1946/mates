import { describe, expect, it, vi } from "vitest";
import { createSailAdapter } from "./sail.js";
import { bridgeTools } from "./bridge.js";

const point = { lat: 5.6, lng: -0.2 };

describe("Sail adapter", () => {
  it("uses the requested trip tool and excludes unavailable and cargo options", async () => {
    const callTool = vi.fn().mockResolvedValue({ options: [
      { provider: "yango", name: "Economy", available: true },
      { provider: "yango", name: "Cargo", available: true },
      { provider: "yango", name: "Okada", available: false },
    ] });
    const result = await createSailAdapter({ callTool }).planTrip("rides", point, point);
    expect(callTool).toHaveBeenCalledWith("compare_rides", { pickup: point, destination: point });
    expect(result.options).toEqual([{ provider: "yango", name: "Economy", available: true }]);
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
