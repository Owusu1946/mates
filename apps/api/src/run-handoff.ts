/** Long operations move to the durable worker before their first side effect. */
export const workerOnlyTools = new Set([
  "cooper_ship_code",
  "computer_use",
  "cooper_make_deck",
  "cooper_edit_deck",
  "browser_search",
  "browser_open",
  "browser_click",
  "cooper_join_meeting",
]);

export const shouldHandoffBeforeTool = (name: string) => workerOnlyTools.has(name);

export class RunHandoffRequested extends Error {
  constructor(readonly reason: "disconnect" | "deadline" | "long_tool") {
    super(`Run handoff requested: ${reason}`);
    this.name = "RunHandoffRequested";
  }
}
