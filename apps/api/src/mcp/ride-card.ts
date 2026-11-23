import type { WorkflowCard } from "../integrations.js";
import { rideInput } from "./rides-tool.js";
import type { executeRideConversation } from "./ride-conversation.js";
import { rideHandoff } from "./ride-links.js";
import type { TripPoint } from "./sail.js";

/** The card may carry provider URLs for resolved, named places; the model result stays coordinate-free. */
export function rideCard(args: unknown, result: Awaited<ReturnType<typeof executeRideConversation>>, userText: string, trip?: { from: TripPoint; to: TripPoint }): WorkflowCard | undefined {
  if ("provider" in result) return { kind: "rides", phase: "done", label: "Travel options", rides: { ...result, ...(trip ? { handoffs: (result.rides ?? []).map((option) => rideHandoff(option.provider, trip.from, trip.to)) } : {}) } };
  const requested = rideInput.safeParse(args);
  const explicitlyRequested = /\b(?:from\s+(?:here|(?:my\s+)?current\s+location|my\s+location)|use\s+(?:my\s+)?(?:current\s+)?location|using\s+(?:my\s+)?(?:current\s+)?location|where\s+i\s+am|near\s+me)\b/i.test(userText);
  if ("needs" in result && result.needs === "from" && explicitlyRequested && requested.success && requested.data.country && /^(?:here|current location|my current location|my location)$/i.test(requested.data.from ?? "")) {
    return { kind: "ride_location", phase: "done", label: "Use your location?", rideLocation: { destination: requested.data.to, country: requested.data.country, mode: requested.data.mode } };
  }
  return undefined;
}
