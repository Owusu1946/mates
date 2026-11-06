import { z } from "zod";
import type { WorkflowCard } from "./integrations.js";
import { gradientOf, type PersonaMate } from "./mates.js";
import { CHAT_MODEL } from "./models.js";

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
  handoff: z.string(),
  assignments: z.array(z.object({ mate_id: z.string(), task: z.string() })).min(1).max(MAX_ASSIGNED),
});

/** Keeps only real members, at most three, the leader alone when nothing valid remains. */
export function normalisePlan(raw: z.infer<typeof planSchema>, members: PersonaMate[], leaderId: string, fallbackTask: string): GroupTurnPlan {
  const ids = new Set(members.map((m) => m.id));
  const seen = new Set<string>();
  const assignments = raw.assignments
    .filter((a) => ids.has(a.mate_id) && !seen.has(a.mate_id) && seen.add(a.mate_id))
    .slice(0, MAX_ASSIGNED)
    .map((a) => ({ mateId: a.mate_id, task: a.task.trim().slice(0, 400) }));
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
        messages: [
          {
            role: "system",
            content: `You are ${leader.name}, leader of a group chat of AI mates helping the user. Decide who handles the user's latest message. Pick the fewest mates whose roles fit (1–3), each with one concrete task; pick yourself for simple chat or when you fit best. If you pick anyone other than yourself, write a one-line handoff in your own voice addressed to them by name (e.g. "Scout, can you check prices? Ledger, compare it with the budget."); otherwise leave handoff empty.\nMembers (id: name — role):\n${roster}`,
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
                handoff: { type: "string" },
                assignments: {
                  type: "array",
                  items: { type: "object", properties: { mate_id: { type: "string" }, task: { type: "string" } }, required: ["mate_id", "task"], additionalProperties: false },
                },
              },
              required: ["handoff", "assignments"],
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
  return { kind: "speaker", phase: "done", label: mate.name, speaker: { id: mate.id, name: mate.name, color: mate.color, gradient: gradientOf(mate.color) } };
}

export type HandoffStatus = "queued" | "working" | "done" | "waiting" | "failed";

const summary = (mate: PersonaMate) => ({ id: mate.id, name: mate.name, color: mate.color, gradient: gradientOf(mate.color) });

/** The relay for a round: who the leader handed work to, in order, and how far each has got. */
export function handoffCard(leader: PersonaMate, items: { mate: PersonaMate; task: string; status: HandoffStatus }[], round?: number): WorkflowCard {
  return {
    kind: "handoff",
    phase: items.some((i) => i.status === "working" || i.status === "queued") ? "running" : "done",
    label: round ? `Round ${round}` : `${leader.name} handed off`,
    handoff: { round, from: summary(leader), items: items.map((i) => ({ mate: summary(i.mate), task: i.task, status: i.status })) },
  };
}
