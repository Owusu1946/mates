import { useAuth } from "@clerk/electron/react";
import { useState } from "react";
import { apiFetch, ensureOk } from "../lib/api.ts";

/**
 * What a card does straight through the API, without the reply carrying on: undoing what a plan
 * did. Each resolves on the card itself, which says how it went.
 */

type Undo = { kind: "app" | "reminder"; id: string };

/** Undoing a plan's done actions (POST /v1/undo/:id, or /v1/reminders/:id/cancel for a reminder), per action. */
export function usePlanUndo() {
  const { getToken } = useAuth();
  const [state, setState] = useState<Record<string, "busy" | "done">>({});
  const [error, setError] = useState<string | null>(null);

  async function run(actionId: string, undo: Undo) {
    if (state[actionId]) return;
    setState((current) => ({ ...current, [actionId]: "busy" }));
    setError(null);
    try {
      const path = undo.kind === "reminder" ? `/v1/reminders/${encodeURIComponent(undo.id)}/cancel` : `/v1/undo/${encodeURIComponent(undo.id)}`;
      await ensureOk(await apiFetch(() => getToken(), path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), "This can no longer be undone.");
      setState((current) => ({ ...current, [actionId]: "done" }));
    } catch (cause) {
      setState(({ [actionId]: _, ...rest }) => rest);
      setError(cause instanceof Error ? cause.message : "This can no longer be undone.");
    }
  }

  return { state, error, run };
}
