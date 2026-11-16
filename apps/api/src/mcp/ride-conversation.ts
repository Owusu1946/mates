import { rideInput, runRideRequest } from "./rides-tool.js";
import { withSail, type createSailAdapter } from "./sail.js";

type Sail = ReturnType<typeof createSailAdapter>;
type RunSail = <T>(run: (sail: Sail) => Promise<T>, signal?: AbortSignal) => Promise<T>;

export const ridesEnabled = () => process.env.RIDES_ENABLED === "true";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 120): string | undefined => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const number = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Only the fields needed to answer enter model history; coordinates and raw responses stay out. */
function summarize(result: unknown, mode: "best" | "rides" | "transit") {
  const root = object(result);
  const rideBranch = mode === "best" ? object(root.rides) : {};
  const rideData = mode === "rides" ? root : object(rideBranch.data);
  const transitBranch = mode === "best" ? object(root.trotro ?? root.transit) : {};
  const transitData = mode === "transit" ? root : object(transitBranch.data);
  const options = Array.isArray(rideData.options) ? rideData.options.slice(0, 8).flatMap((value) => {
    const option = object(value), price = object(option.price);
    const provider = text(option.provider), name = text(option.name), amount = number(price.amount), currency = text(price.currency, 3);
    return provider && name ? [{ provider, name, price: amount !== undefined && currency ? { amount, currency } : null, ...(number(option.etaMinutes) !== undefined ? { etaMinutes: number(option.etaMinutes) } : {}), ...(option.available === undefined ? { availability: "unknown" } : {}) }] : [];
  }) : [];
  const routes = Array.isArray(transitData.routes) ? transitData.routes.slice(0, 2).map((value) => {
    const route = object(value), duration = object(route.durationRangeMinutes);
    const steps = Array.isArray(route.steps) ? route.steps.slice(0, 12).flatMap((step) => {
      const item = object(step), instruction = text(item.instruction, 250), routeName = text(item.route);
      return instruction || routeName ? [{ ...(instruction ? { instruction } : {}), ...(routeName ? { route: routeName } : {}), ...(text(item.type) ? { type: text(item.type) } : {}), ...(number(item.fare) !== undefined ? { fare: number(item.fare) } : {}), ...(number(item.stopCount) !== undefined ? { stopCount: number(item.stopCount) } : {}) }] : [];
    }) : [];
    return { ...(number(route.totalFare) !== undefined ? { fare: number(route.totalFare) } : {}), ...(text(route.currency, 3) ? { currency: text(route.currency, 3) } : {}), ...(number(duration.min) !== undefined && number(duration.max) !== undefined ? { minutes: { min: number(duration.min), max: number(duration.max) } } : {}), steps };
  }) : [];
  return { provider: "Sail", mode, ...(text(root.status) ? { status: text(root.status) } : {}), ...(mode !== "transit" ? { rides: options, ...(text(rideBranch.status) ? { ridesStatus: text(rideBranch.status) } : {}), ...(rideData.complete === false || (Array.isArray(rideData.options) && rideData.options.length > 8) ? { ridesComplete: false } : {}) } : {}), ...(mode !== "rides" ? { transit: routes, ...(text(transitData.network) ? { transitNetwork: text(transitData.network) } : {}), ...(text(transitBranch.status) ? { transitStatus: text(transitBranch.status) } : {}), ...(Array.isArray(transitData.routesRequiringRideConnection) && transitData.routesRequiringRideConnection.length ? { rideConnectionsAvailable: true } : {}) } : {}), note: "Estimates can change. A null price means no price was provided, not that the ride is unavailable. Mates cannot book a ride. Report missing or incomplete results honestly." };
}

/** This batch supports named places; location consent and explicit place-selection cards come later. */
export async function executeRideConversation(args: unknown, context: { signal?: AbortSignal; run?: RunSail; onSailCall?: () => void } = {}) {
  const parsed = rideInput.safeParse(args);
  if (!parsed.success) return { error: "Please provide a destination and valid trip details." };
  const { from, to, mode } = parsed.data;
  const country = parsed.data.country;
  if (!country) return { needs: "country", message: "Is the trip in Ghana or Great Britain?" };
  const unresolved = /^(?:here|current location|my location|home|my home|work|my work|office|my office)$/i;
  if (!from || unresolved.test(from)) return { needs: "from", message: "Where are you starting from?" };
  if (unresolved.test(to)) return { needs: "to", message: "What is the destination's address or place name?" };
  // This is input validation, not a guarantee that model arguments have not already been persisted.
  if (/[-+]?\d+\.\d+\s*[, ]\s*[-+]?\d+\.\d+/.test(`${from} ${to}`)) return { error: "Please use a place name or address." };
  try {
    return await (context.run ?? withSail)(async (sail) => {
      context.onSailCall?.();
      const result = await runRideRequest(sail, { from: { kind: "search", query: from }, to: { kind: "search", query: to }, country, mode });
      if (result.kind === "place_not_found") return { needs: result.field, message: "I couldn't find that place. Please provide a more specific name or address." };
      if (result.kind === "place_choice") return { needs: result.field, choices: result.choices.map(({ name, address }) => ({ name: text(name), ...(address ? { address: text(address) } : {}) })), message: "Ask the user which place they mean." };
      return { from: text(result.from.name) ?? from, to: text(result.to.name) ?? to, ...summarize(result.result, mode) };
    }, context.signal);
  } catch {
    context.signal?.throwIfAborted();
    return { error: "Ride and transit information isn't available right now. Please try again." };
  }
}
