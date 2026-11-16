import { z } from "zod";
import { createSailAdapter, type RideMode, type TripPoint } from "./sail.js";

export const rideInput = z.object({
  from: z.string().trim().min(2).max(120).optional().describe("Starting place or address. Use 'here' only when the user explicitly requests their current location. Use a saved home or work address only when clearly known."),
  to: z.string().trim().min(2).max(120).describe("Destination."),
  mode: z.enum(["best", "rides", "transit"]).default("best"),
  country: z.enum(["gh", "gb"]).optional().describe("Country containing the journey: gh for Ghana, gb for Great Britain. Infer only from clear place names; otherwise ask."),
});
const { $schema: _schema, ...parameters } = z.toJSONSchema(rideInput, { io: "input" });

export const ridesTool = {
  type: "function" as const,
  function: {
    name: "cooper_rides",
    description: "Compare available rides and plan public transit. Cannot book rides.",
    parameters,
  },
};

type Place = { kind: "search"; query: string } | { kind: "selected"; placeId: string } | { kind: "point"; point: TripPoint };
type Sail = ReturnType<typeof createSailAdapter>;
type Choice = { placeId: string; name: string; address?: string };
type SearchPlace = { placeId: string; name: string; address?: string; location?: TripPoint };

function matchPlace(places: SearchPlace[], query: string): SearchPlace[] {
  if (places.length <= 1) return places;
  const normalize = (value: string) => value.replace(/[–—-]/g, " ").replace(/[()]/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const requested = normalize(query.replace(/(?:,\s*|\s+)(?:Ghana|Great Britain|United Kingdom|UK|GB)$/i, ""));
  // Sail can return several results with the same city name. An exact address
  // identifies the city-level result; prefer it over neighborhood addresses.
  const exactAddress = places.filter((place) => place.address && normalize(place.address) === requested);
  if (exactAddress.length === 1) return exactAddress;
  const exactAddressName = exactAddress.filter((place) => normalize(place.name) === requested);
  if (exactAddressName.length === 1) return exactAddressName;
  // Also accept an exact place name or an explicit general listing.
  const exact = places.filter((place) => normalize(place.name) === requested);
  // For a broad area such as Osu, Sail can return both a specific station and
  // the area itself. Prefer the one attached directly to its parent city.
  const parentCity = exact.filter((place) => {
    const address = normalize(place.address ?? "");
    return address.split(" ").length === 1 && !/[0-9,/#()–—-]/.test(address);
  });
  if (parentCity.length === 1) return parentCity;
  if (exact.length === 1) return exact;
  const general = places.filter((place) => {
    const name = normalize(place.name);
    const address = normalize(place.address ?? "");
    return [name, address].some((value) => value === `${requested} general` || value === `${requested} general listing`);
  });
  return general.length === 1 ? general : places;
}

function placeResult(places: SearchPlace[], query: string): { place: SearchPlace } | { choices: Choice[] } | { notFound: true } {
  const matches = matchPlace(places, query);
  if (!matches.length) return { notFound: true };
  if (matches.length === 1) return { place: matches[0]! };
  const normalizedQuery = query.toLocaleLowerCase();
  if (/\bairport\b/i.test(normalizedQuery)) {
    const airports = matches.filter((place) => /\bairport\b/i.test(place.name) && !/\b(?:control tower|immigration|hotel|parking)\b/i.test(place.name));
    if (airports.length === 1) return { place: airports[0]! };
  }
  return { choices: matches.slice(0, 3).map(({ placeId, name, address }) => ({ placeId, name, ...(address ? { address } : {}) })) };
}

async function pointFor(sail: Sail, match: SearchPlace): Promise<TripPoint> {
  if (match.location) return { ...match.location, name: match.name, ...(match.address ? { address: match.address } : {}), placeId: match.placeId };
  return (await sail.resolvePlace(match.placeId)).place;
}

/** Resolve explicit user choices without giving a model responsibility for coordinates. */
async function resolve(sail: Sail, place: Place, country: "gh" | "gb", near?: TripPoint): Promise<{ point: TripPoint } | { choices: Choice[] }> {
  if (place.kind === "point") return { point: place.point };
  if (place.kind === "selected") return { point: (await sail.resolvePlace(place.placeId)).place };
  const result = placeResult((await sail.searchPlaces(place.query, country, near ? { lat: near.lat, lng: near.lng } : undefined)).places, place.query);
  if ("notFound" in result) return { choices: [] };
  if ("choices" in result) return result;
  return { point: await pointFor(sail, result.place) };
}

/**
 * The conversation layer resolves home/work and location permission before calling this.
 * A result requiring a place choice is never automatically retried with the first match.
 */
export async function runRideRequest(sail: Sail, request: { from: Place; to: Place; country: "gh" | "gb"; mode: RideMode }) {
  // Both text searches are independent. Run them together, then resolve unique
  // results together to avoid waiting for several sequential MCP round trips.
  if (request.from.kind === "search" && request.to.kind === "search") {
    const [fromSearch, toSearch] = await Promise.all([
      sail.searchPlaces(request.from.query, request.country),
      sail.searchPlaces(request.to.query, request.country),
    ]);
    const fromMatch = placeResult(fromSearch.places, request.from.query);
    if ("notFound" in fromMatch) return { kind: "place_not_found" as const, field: "from" as const };
    if ("choices" in fromMatch) return { kind: "place_choice" as const, field: "from" as const, choices: fromMatch.choices };
    const toMatch = placeResult(toSearch.places, request.to.query);
    if ("notFound" in toMatch) return { kind: "place_not_found" as const, field: "to" as const };
    if ("choices" in toMatch) return { kind: "place_choice" as const, field: "to" as const, choices: toMatch.choices };
    const [from, to] = await Promise.all([pointFor(sail, fromMatch.place), pointFor(sail, toMatch.place)]);
    const result = await sail.planTrip(request.mode, from, to);
    return { kind: "trip" as const, from, to, result };
  }

  const knownTo = request.from.kind === "search" && request.to.kind !== "search" ? await resolve(sail, request.to, request.country) : undefined;
  const from = await resolve(sail, request.from, request.country, knownTo && "point" in knownTo ? knownTo.point : undefined);
  if ("choices" in from) return from.choices.length ? { kind: "place_choice" as const, field: "from" as const, choices: from.choices } : { kind: "place_not_found" as const, field: "from" as const };
  const to = knownTo ?? await resolve(sail, request.to, request.country, from.point);
  if ("choices" in to) return to.choices.length ? { kind: "place_choice" as const, field: "to" as const, choices: to.choices } : { kind: "place_not_found" as const, field: "to" as const };
  const result = await sail.planTrip(request.mode, from.point, to.point);
  return { kind: "trip" as const, from: from.point, to: to.point, result };
}
