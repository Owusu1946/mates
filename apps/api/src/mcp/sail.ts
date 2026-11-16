import { z } from "zod";
import { withMcp, type McpConnection } from "./client.js";
import { sailServer } from "./registry.js";

const coordinates = z.object({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) });
const place = z.object({ placeId: z.string().min(1), name: z.string().min(1), address: z.string().optional(), location: coordinates.optional() }).passthrough();
const searchResult = z.object({ places: z.array(place) }).passthrough();
const tripPoint = coordinates.extend({ name: z.string().optional(), address: z.string().optional(), placeId: z.string().optional() });
const rideOption = z.object({ provider: z.string(), name: z.string(), available: z.boolean().optional(), price: z.object({ amount: z.number().finite().nonnegative(), currency: z.string().length(3) }).optional() }).passthrough();
const ridesResult = z.object({ options: z.array(z.unknown()) }).passthrough();
const resolvedResult = z.object({ place: tripPoint.extend({ placeId: z.string().min(1), name: z.string().min(1) }) }).passthrough();
const transitResult = z.object({ routes: z.array(z.record(z.string(), z.unknown())), routesRequiringRideConnection: z.array(z.record(z.string(), z.unknown())).optional() }).passthrough();
const combinedResult = z.object({ status: z.string().optional(), rides: z.unknown().optional(), trotro: z.unknown().optional(), transit: z.unknown().optional() });
const branch = z.object({ status: z.string(), data: z.unknown().optional() });

function sailData(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const text = value.filter((block): block is { type: "text"; text: string } => typeof block === "object" && block !== null && block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
  try { return JSON.parse(text); } catch { throw new Error("Sail returned an invalid response."); }
}

function filterRides(rides: z.infer<typeof ridesResult>) {
  const options = rides.options.flatMap((option) => {
    const parsed = rideOption.safeParse(option);
    return parsed.success ? [parsed.data] : [];
  });
  return { ...rides, ...(options.length !== rides.options.length ? { complete: false } : {}), options: options.filter((option) => option.available !== false && !/cargo|delivery/i.test(option.name)).sort((a, b) => (a.price?.amount ?? Infinity) - (b.price?.amount ?? Infinity)) };
}

function normalizeBranch(value: unknown, kind: "rides" | "transit") {
  const parsed = branch.safeParse(value);
  if (!parsed.success) return { status: "unavailable" };
  if (!parsed.data.data) return { status: parsed.data.status };
  const data = (kind === "rides" ? ridesResult : transitResult).safeParse(parsed.data.data);
  if (!data.success) return { status: "unavailable" };
  return { status: parsed.data.status, data: kind === "rides" ? filterRides(data.data as z.infer<typeof ridesResult>) : data.data };
}

export type TripPoint = z.infer<typeof tripPoint>;
export type RideMode = "best" | "rides" | "transit";

/** Injectable connection keeps the adapter independent of transport and easy to test. */
export function createSailAdapter(connection: Pick<McpConnection, "callTool">) {
  return {
    async searchPlaces(query: string, country: "gh" | "gb", near?: z.infer<typeof coordinates>) {
      const input = z.string().trim().min(2).max(120).parse(query);
      return searchResult.parse(sailData(await connection.callTool("search_places", { query: input, countryCode: country, ...(near ? { near: coordinates.parse(near) } : {}) })));
    },
    async resolvePlace(placeId: string) {
      return resolvedResult.parse(sailData(await connection.callTool("resolve_place", { placeId: z.string().min(1).max(500).parse(placeId) })));
    },
    async planTrip(mode: RideMode, pickup: TripPoint, destination: TripPoint) {
      const validMode = z.enum(["best", "rides", "transit"]).parse(mode);
      const tool = { best: "plan_trip", rides: "compare_rides", transit: "plan_public_transport" }[validMode];
      const result = sailData(await connection.callTool(tool, { pickup: tripPoint.parse(pickup), destination: tripPoint.parse(destination) }));
      if (validMode === "transit") return transitResult.parse(result);
      if (validMode === "rides") return filterRides(ridesResult.parse(result));
      const combined = combinedResult.parse(result);
      const rides = combined.rides !== undefined ? normalizeBranch(combined.rides, "rides") : undefined;
      const trotro = combined.trotro !== undefined ? normalizeBranch(combined.trotro, "transit") : undefined;
      const transit = combined.transit !== undefined ? normalizeBranch(combined.transit, "transit") : undefined;
      const degraded = [rides, trotro, transit].some((item) => item?.status === "unavailable");
      return { status: degraded ? "partial" : combined.status ?? "partial", ...(rides ? { rides } : {}), ...(trotro ? { trotro } : {}), ...(transit ? { transit } : {}) };
    },
  };
}

export function withSail<T>(run: (sail: ReturnType<typeof createSailAdapter>) => Promise<T>, signal?: AbortSignal) {
  return withMcp(sailServer, (connection) => run(createSailAdapter(connection)), signal);
}
