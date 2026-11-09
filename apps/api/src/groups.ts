import { z } from "zod";
import type { WorkflowCard } from "./integrations.js";
import { gradientOf, type PersonaMate } from "./mates.js";
import { CHAT_MODEL } from "./models.js";
import { bestMate } from "./workboard.js";

export type Assignment = { mateId: string; task: string };
export type GroupTurnPlan = { handoff: string; assignments: Assignment[] };
const MAX_ASSIGNED = 3;

/** Members tagged as `@Name` (names may contain spaces), in the order they were tagged. */
export function parseMentions(text: string, members: PersonaMate[]) {
  const lower = text.toLowerCase();
  const found: { mate: PersonaMate; at: number }[] = [];
  // Longest names first, so "@Ama Lee" wins over "@Ama".
  for (const mate of [...members].sort((a, b) => b.name.length - a.name.length)) {
    const tag = `@${mate.name.toLowerCase()}`;
    let at = lower.indexOf(tag);
    while (at >= 0) {
      const next = lower[at + tag.length];
      const taken = found.some((f) => at >= f.at && at < f.at + f.mate.name.length + 1);
      if (!taken && (next === undefined || !/[\p{L}\p{N}]/u.test(next))) {
        if (!found.some((f) => f.mate.id === mate.id)) found.push({ mate, at });
        break;
      }
      at = lower.indexOf(tag, at + 1);
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.mate);
}

const planSchema = z.object({
  /** True when the message asks for work (research, apps, writing, code), which the leader never takes on. */
  needs_work: z.boolean().default(false),
  handoff: z.string(),
  assignments: z.array(z.object({ mate_id: z.string(), task: z.string() })).min(1).max(MAX_ASSIGNED),
});

/**
 * Keeps only real members, at most three. Work goes to teammates, never the leader, while it has
 * any: the leader keeps only conversation. With nothing valid left, the leader replies alone.
 */
export function normalisePlan(raw: z.input<typeof planSchema>, members: PersonaMate[], leaderId: string, fallbackTask: string): GroupTurnPlan {
  const ids = new Set(members.map((m) => m.id));
  const hasTeam = members.some((m) => m.id !== leaderId);
  const seen = new Set<string>();
  let assignments = raw.assignments
    .filter((a) => ids.has(a.mate_id) && !seen.has(a.mate_id) && seen.add(a.mate_id))
    .slice(0, MAX_ASSIGNED)
    .map((a) => ({ mateId: a.mate_id, task: a.task.trim().slice(0, 400) }));
  if (raw.needs_work && hasTeam) {
    assignments = assignments.filter((a) => a.mateId !== leaderId);
    if (!assignments.length) assignments = [{ mateId: bestMate(fallbackTask, members, leaderId, new Map()), task: fallbackTask.slice(0, 400) }];
  }
  if (!assignments.length) return { handoff: "", assignments: [{ mateId: leaderId, task: fallbackTask }] };
  // A handoff only makes sense when someone other than the leader is picked.
  const handsOff = assignments.some((a) => a.mateId !== leaderId);
  return { handoff: handsOff ? raw.handoff.trim().slice(0, 300) : "", assignments };
}

/**
 * The leader decides who handles a message nobody was tagged in: the fewest mates whose roles
 * fit, each with its own task, and a one-line handoff in the leader's voice.
 */
export async function planGroupTurn(input: { members: PersonaMate[]; leaderId: string; turns: { role: string; content: string }[] }): Promise<GroupTurnPlan> {
  const leader = input.members.find((m) => m.id === input.leaderId) ?? input.members[0]!;
  const latest = input.turns.at(-1)?.content ?? "";
  const roster = input.members.map((m) => `- ${m.id}: ${m.name} — ${m.roleDescription || m.role}`).join("\n");
  const recent = input.turns.slice(-6).map((t) => `${t.role === "user" ? "User" : "Mates"}: ${t.content.slice(0, 600)}`).join("\n");
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 400,
        // Routing is a quick call; low reasoning keeps replies in a group from feeling slow.
        reasoning: { effort: "low" },
        messages: [
          {
            role: "system",
            content: `You are ${leader.name}, chief of staff of a group chat of AI mates helping the user. Decide who handles the user's latest message. You never do the work yourself: anything that needs research, apps, writing, analysis or code goes to the fewest teammates whose roles fit (1–3), each with one concrete task, and needs_work is true. Answer yourself only quick conversation (greetings, thanks, a question about what the team is doing), with needs_work false. When you pick teammates, write a one-line handoff in your own voice addressed to them by name (e.g. "Scout, can you check prices? Ledger, compare it with the budget."); otherwise leave handoff empty.\nMembers (id: name — role):\n${roster}`,
          },
          { role: "user", content: `Recent conversation:\n${recent}\n\nLatest message to route:\n${latest.slice(0, 2_000)}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "group_turn",
            strict: true,
            schema: {
              type: "object",
              properties: {
                needs_work: { type: "boolean" },
                handoff: { type: "string" },
                assignments: {
                  type: "array",
                  items: { type: "object", properties: { mate_id: { type: "string" }, task: { type: "string" } }, required: ["mate_id", "task"], additionalProperties: false },
                },
              },
              required: ["needs_work", "handoff", "assignments"],
              additionalProperties: false,
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error(String(response.status));
    const result = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return normalisePlan(planSchema.parse(JSON.parse(result.choices?.[0]?.message?.content ?? "null")), input.members, leader.id, latest);
  } catch {
    // Routing must never block a reply: the leader answers alone.
    return { handoff: "", assignments: [{ mateId: leader.id, task: latest }] };
  }
}

export function speakerCard(mate: PersonaMate): WorkflowCard {
  return { kind: "speaker", phase: "done", label: mate.name, speaker: { id: mate.id, name: mate.name, color: mate.color, shape: mate.shape, gradient: gradientOf(mate.color) } };
}

export type HandoffStatus = "queued" | "working" | "done" | "waiting" | "failed";

const summary = (mate: PersonaMate) => ({ id: mate.id, name: mate.name, color: mate.color, shape: mate.shape, gradient: gradientOf(mate.color) });

/** The relay for a round: who the leader handed work to, in order, and how far each has got. */
export function handoffCard(leader: PersonaMate, items: { mate: PersonaMate; task: string; status: HandoffStatus }[], round?: number): WorkflowCard {
  return {
    kind: "handoff",
    phase: items.some((i) => i.status === "working" || i.status === "queued") ? "running" : "done",
    label: round ? `Round ${round}` : `${leader.name} handed off`,
    handoff: { round, from: summary(leader), items: items.map((i) => ({ mate: summary(i.mate), task: i.task, status: i.status })) },
  };
}
