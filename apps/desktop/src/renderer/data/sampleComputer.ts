import type { ScreenStep } from "../computer/computer.logic.ts";
import { LEAD_ID } from "./sampleCrew.ts";

/**
 * What the sample crew does on your computer and says on calls, until the panels reach the API and
 * LiveKit. Kofi books a ride (with a payment to approve), Esi researches hostels (with a sign-in
 * you do yourself), and anyone else checks something simple.
 */

export const COMPUTER_TASKS: Record<string, { title: string; steps: ScreenStep[] }> = {
  [LEAD_ID]: {
    title: "Book a Bolt from East Legon to Accra Mall",
    steps: [
      { id: "k1", label: "Opening bolt.com", screen: "bolt-home", cursor: { x: 50, y: 18 } },
      { id: "k2", label: "Typing the pickup: East Legon", screen: "bolt-pickup", cursor: { x: 30, y: 34 } },
      { id: "k3", label: "Typing the destination: Accra Mall", screen: "bolt-pickup", cursor: { x: 30, y: 48 } },
      { id: "k4", label: "Comparing rides", screen: "bolt-options", cursor: { x: 70, y: 46 } },
      { id: "k5", label: "Choosing Bolt, GH¢38", screen: "bolt-options", cursor: { x: 40, y: 36 } },
      {
        id: "k6",
        label: "Waiting for your OK to pay",
        screen: "bolt-pay",
        cursor: { x: 50, y: 70 },
        needs: { kind: "approval", title: "Pay GH¢38 to Bolt?", detail: "MTN MoMo · 024 ••• 4417. You'll approve it with your PIN on your phone." },
      },
      { id: "k7", label: "Booked: Kwame is 4 minutes away", screen: "bolt-done", cursor: { x: 50, y: 56 } },
    ],
  },
  esi: {
    title: "Find hostels near KNUST under GH¢4,000",
    steps: [
      { id: "e1", label: "Searching hostels near KNUST", screen: "search", cursor: { x: 40, y: 20 } },
      { id: "e2", label: "Opening Bomso Heights", screen: "search", cursor: { x: 34, y: 42 } },
      {
        id: "e3",
        label: "Waiting for you to sign in to Booking.com",
        screen: "login",
        cursor: { x: 50, y: 48 },
        needs: { kind: "login", title: "Sign in to Booking.com", detail: "To see this year's prices. Take over and sign in; Esi never sees what you type." },
      },
      { id: "e3b", label: "Reading reviews", screen: "listing", cursor: { x: 60, y: 62 } },
      { id: "e4", label: "Checking the walk to campus", screen: "listing", cursor: { x: 72, y: 34 } },
      { id: "e5", label: "Saving 3 options to a page", screen: "search", cursor: { x: 80, y: 18 } },
    ],
  },
};

export const DEFAULT_TASK = {
  title: "Check today's weather in Accra",
  steps: [
    { id: "w1", label: "Searching the weather in Accra", screen: "search", cursor: { x: 40, y: 20 } },
    { id: "w2", label: "Reading the forecast", screen: "listing", cursor: { x: 50, y: 50 } },
  ] satisfies ScreenStep[],
};

/** What each mate says on a call, in turn. */
export const CALL_LINES: Record<string, string[]> = {
  [LEAD_ID]: ["Hey! What can I do for you?", "Sure. I'll move it to Thursday and tell Kwesi.", "Done. Anything else before your 2pm?", "I'll remind you an hour before."],
  esi: ["I found three hostels that fit.", "Bomso Heights is the closest, four minutes' walk.", "Want me to send the page to your phone?"],
  abena: ["Thursday 10:30 is free at East Legon Dental.", "I can book it now if you like."],
  yaw: ["The fix is in. Tests pass.", "I'll open the PR when you say go."],
  akua: ["You're under budget this month.", "Packaging came to GH¢1,840."],
};

/** Your side of the call, for the sample. */
export const YOUR_LINES = ["Can you move my supplier call?", "Perfect, thanks.", "Yes please.", "That's all for now."];
