import { describe, expect, it } from "vitest";
import type { WorkflowCard } from "./integrations.js";
import { answerText, resultMessage, toMrkdwn, waitingBlocks, waitingCard } from "./slack-delivery.js";

const tool = (result: Partial<WorkflowCard>) => ({ type: "tool-call", toolName: "cooper_workflow", result });
const values = (blocks: Record<string, unknown>[]) =>
  blocks.flatMap((block) => ((block.elements as { value?: string; url?: string }[] | undefined) ?? []).map((element) => element.value ?? element.url));

describe("what a mate posts back to Slack", () => {
  it("speaks Slack's markdown", () => {
    expect(toMrkdwn("## Venues\n**The Rooftop** fits 20\n- [Book it](https://example.com/book)")).toBe("*Venues*\n*The Rooftop* fits 20\n• <https://example.com/book|Book it>");
  });

  it("joins the answer's words and finds the card it waits on", () => {
    const content = [{ type: "text", text: "Found two." }, tool({ kind: "step", phase: "done", label: "Searched" }), { type: "text", text: "Pick one." }, tool({ kind: "choice", phase: "waiting", label: "Which account?" })];
    expect(answerText(content)).toBe("Found two.\nPick one.");
    expect(waitingCard(content)?.kind).toBe("choice");
    expect(waitingCard([tool({ kind: "step", phase: "done", label: "x" })])).toBeUndefined();
  });

  it("turns each kind of question into buttons carrying the app's own choices", () => {
    const choice = waitingBlocks({ kind: "choice", phase: "waiting", label: "Which Gmail?", options: [{ id: "acc_1", label: "Work", toolkit: "gmail" }, { id: "acc_2", label: "Home", toolkit: "gmail" }] }, "run-1");
    expect(values(choice)).toEqual(["run-1|acc_1", "run-1|acc_2"]);

    const plan = waitingBlocks({ kind: "plan", phase: "waiting", label: "Review the plan", plan: { summary: "Send the invite", actions: [{ id: "a1", title: "Email Efua", kind: "app", details: [], status: "proposed" }, { id: "a2", title: "Hold Tuesday", kind: "app", details: [], status: "proposed" }] } }, "run-2");
    expect(values(plan)).toEqual(["run-2|approve:a1,a2", "run-2|decline"]);

    const connect = waitingBlocks({ kind: "connection", phase: "waiting", label: "Connect Gmail", name: "Gmail" }, "run-3");
    expect(values(connect)[0]).toContain("/v1/slack/open?to=connections");
    expect(values(connect)[1]).toBe("run-3|connected");
  });

  it("says plainly when a run failed or was stopped", () => {
    expect(resultMessage("failed", [], "The app timed out.", "r").text).toBe("I couldn’t finish that. The app timed out.");
    expect(resultMessage("cancelled", [], null, "r").text).toBe("Stopped.");
    expect(resultMessage("completed", [], null, "r").text).toBe("Done.");
    expect(resultMessage("waiting", [tool({ kind: "approval", phase: "waiting", label: "Send this email?" })], null, "r").blocks?.length).toBe(2);
  });
});
