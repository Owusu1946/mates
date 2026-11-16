import { z } from "zod";
import { createSailAdapter, type RideMode, type TripPoint } from "./sail.js";

const input = z.object({
  from: z.string().trim().min(2).max(120).describe("Starting place, home, work, or here."),
  to: z.string().trim().min(2).max(120).describe("Destination."),
  mode: z.enum(["best", "rides", "transit"]).default("best"),
  country: z.enum(["gh", "gb"]).default("gh"),
});

export const ridesTool = {
  type: "function" as const,
  function: {
    name: "cooper_rides",
    description: "Compare available rides and plan public transit. Cannot book rides.",
    parameters: z.toJSONSchema(input),
  },
};

type Place = { kind: "search"; query: string } | { kind: "selected"; placeId: string } | { kind: "point"; point: TripPoint };
type Sail = ReturnType<typeof createSailAdapter>;
type Choice = { placeId: string; name: string; address?: string };

/** Resolve explicit user choices without giving a model responsibility for coordinates. */
async function resolve(sail: Sail, place: Place, country: "gh" | "gb"): Promise<{ point: TripPoint } | { choices: Choice[] }> {
  if (place.kind === "point") return { point: place.point };
  if (place.kind === "selected") return { point: (await sail.resolvePlace(place.placeId)).place };
  const matches = (await sail.searchPlaces(place.query, country)).places;
  if (matches.length !== 1) return { choices: matches.slice(0, 3).map(({ placeId, name, address }) => ({ placeId, name, ...(address ? { address } : {}) })) };
  return { point: (await sail.resolvePlace(matches[0]!.placeId)).place };
}

/**
 * The conversation layer resolves home/work and location permission before calling this.
 * A result requiring a place choice is never automatically retried with the first match.
 */
export async function runRideRequest(sail: Sail, request: { from: Place; to: Place; country: "gh" | "gb"; mode: RideMode }) {
  const from = await resolve(sail, request.from, request.country);
  if ("choices" in from) return from.choices.length ? { kind: "place_choice" as const, field: "from" as const, choices: from.choices } : { kind: "place_not_found" as const, field: "from" as const };
  const to = await resolve(sail, request.to, request.country);
  if ("choices" in to) return to.choices.length ? { kind: "place_choice" as const, field: "to" as const, choices: to.choices } : { kind: "place_not_found" as const, field: "to" as const };
  const result = await sail.planTrip(request.mode, from.point, to.point);
  return { kind: "trip" as const, from: from.point, to: to.point, result };
}
