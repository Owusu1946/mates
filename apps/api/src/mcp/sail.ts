import { z } from "zod";
import { withMcp, type McpConnection } from "./client.js";
import { sailServer } from "./registry.js";

const coordinates = z.object({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) });
const place = z.object({ placeId: z.string().min(1), name: z.string().min(1), address: z.string().optional(), location: coordinates.optional() }).passthrough();
const searchResult = z.object({ places: z.array(place) }).passthrough();
const tripPoint = coordinates.extend({ name: z.string().optional(), address: z.string().optional(), placeId: z.string().optional() });
const rideOption = z.object({ provider: z.string(), name: z.string(), available: z.boolean().optional(), price: z.object({ amount: z.number().finite().nonnegative(), currency: z.string().length(3) }).optional() }).passthrough();
const ridesResult = z.object({ options: z.array(rideOption) }).passthrough();
const resolvedResult = z.object({ place: tripPoint.extend({ placeId: z.string().min(1), name: z.string().min(1) }) }).passthrough();
const transitResult = z.object({ routes: z.array(z.record(z.string(), z.unknown())), routesRequiringRideConnection: z.array(z.record(z.string(), z.unknown())).optional() }).passthrough();
const combinedResult = z.object({ status: z.string(), rides: z.object({ status: z.string(), data: ridesResult.optional() }).passthrough().optional() }).passthrough();

function filterRides<T extends z.infer<typeof ridesResult>>(rides: T): T {
  return { ...rides, options: rides.options.filter((option) => option.available !== false && !/cargo|delivery/i.test(option.name)).sort((a, b) => (a.price?.amount ?? Infinity) - (b.price?.amount ?? Infinity)) };
}

export type TripPoint = z.infer<typeof tripPoint>;
export type RideMode = "best" | "rides" | "transit";

/** Injectable connection keeps the adapter independent of transport and easy to test. */
export function createSailAdapter(connection: Pick<McpConnection, "callTool">) {
  return {
    async searchPlaces(query: string, country: "gh" | "gb", near?: z.infer<typeof coordinates>) {
      const input = z.string().trim().min(2).max(120).parse(query);
      return searchResult.parse(await connection.callTool("search_places", { query: input, countryCode: country, ...(near ? { near: coordinates.parse(near) } : {}) }));
    },
    async resolvePlace(placeId: string) {
      return resolvedResult.parse(await connection.callTool("resolve_place", { placeId: z.string().min(1).max(500).parse(placeId) }));
    },
    async planTrip(mode: RideMode, pickup: TripPoint, destination: TripPoint) {
      const validMode = z.enum(["best", "rides", "transit"]).parse(mode);
      const tool = { best: "plan_trip", rides: "compare_rides", transit: "plan_public_transport" }[validMode];
      const result = await connection.callTool(tool, { pickup: tripPoint.parse(pickup), destination: tripPoint.parse(destination) });
      if (validMode === "transit") return transitResult.parse(result);
      if (validMode === "rides") return filterRides(ridesResult.parse(result));
      const combined = combinedResult.parse(result);
      return { ...combined, ...(combined.rides?.data ? { rides: { ...combined.rides, data: filterRides(combined.rides.data) } } : {}) };
    },
  };
}

export function withSail<T>(run: (sail: ReturnType<typeof createSailAdapter>) => Promise<T>, signal?: AbortSignal) {
  return withMcp(sailServer, (connection) => run(createSailAdapter(connection)), signal);
}
