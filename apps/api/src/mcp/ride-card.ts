import type { WorkflowCard } from "../integrations.js";
import { rideInput } from "./rides-tool.js";
import type { executeRideConversation } from "./ride-conversation.js";

/** Cards contain the compact, sanitized result; device coordinates never enter the card. */
export function rideCard(args: unknown, result: Awaited<ReturnType<typeof executeRideConversation>>, userText: string): WorkflowCard | undefined {
  if ("provider" in result) return { kind: "rides", phase: "done", label: "Travel options", rides: result };
  const requested = rideInput.safeParse(args);
  const explicitlyRequested = /\b(?:from\s+(?:here|(?:my\s+)?current\s+location|my\s+location)|use\s+(?:my\s+)?(?:current\s+)?location|using\s+(?:my\s+)?(?:current\s+)?location|where\s+i\s+am|near\s+me)\b/i.test(userText);
  if ("needs" in result && result.needs === "from" && explicitlyRequested && requested.success && requested.data.country && /^(?:here|current location|my current location|my location)$/i.test(requested.data.from ?? "")) {
    return { kind: "ride_location", phase: "done", label: "Use your location?", rideLocation: { destination: requested.data.to, country: requested.data.country, mode: requested.data.mode } };
  }
  return undefined;
}
