/** User-visible outcomes for background work. Null means work is still active or was cancelled. */
export type ReturnTripOutcome = "done" | "blocked" | "failed";
// Browser sessions live inside a parent run. Its finding owns the push; browser outcomes classify the card only.
export type ReturnTripSource = "run" | "code" | "deck" | "mission" | "call" | "browser" | "computer";

export function returnTripOutcome(source: ReturnTripSource, status: string): ReturnTripOutcome | null {
  switch (source) {
    case "run":
      if (status === "completed") return "done";
      if (status === "waiting") return "blocked";
      if (status === "failed") return "failed";
      return null;
    case "code":
    case "computer":
      if (status === "done") return "done";
      if (source === "computer" && status === "waiting") return "blocked";
      if (status === "failed") return "failed";
      return null;
    case "deck":
      if (status === "ready") return "done";
      if (status === "failed") return "failed";
      return null;
    case "mission":
      if (status === "done") return "done";
      if (status === "needs_input") return "blocked";
      return null;
    case "call":
      if (status === "ended") return "done";
      if (status === "failed") return "failed";
      return null;
    case "browser":
      if (status === "completed") return "done";
      if (["approval", "login", "user_control", "verification"].includes(status)) return "blocked";
      if (["blocked", "error", "expired"].includes(status)) return "failed";
      return null;
  }
}
