import { z } from "zod";
import { createAgentResponse } from "./agent-chat.js";
import { attachmentRefSchema, expandAttachments } from "./attachments.js";
import { memoryContext } from "./memory.js";
import { recallContext } from "./recall.js";
import { embedOne } from "./embeddings.js";

const turnSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().max(8_000),
    attachments: z.array(attachmentRefSchema).max(4).optional(),
  })
  // A photo or file alone is a complete message.
  .refine((turn) => turn.content.length > 0 || !!turn.attachments?.length, "A message needs text or an attachment");

export const chatRequestSchema = z.object({
  messages: z.array(turnSchema).min(1).max(40),
  /** The phone's IANA timezone, so times are read and written in the user's local time. */
  timezone: z.string().max(64).regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/).optional(),
  resumeRunId: z.string().uuid().optional(),
  choice: z.string().min(1).max(200).optional(),
});

export type ChatTurn = z.infer<typeof turnSchema>;

export async function requestChatCompletion(
  messages: ChatTurn[],
  signal: AbortSignal,
  userId?: string,
  resumeRunId?: string,
  choice?: string,
  preamble = "You are Cooper, a clear and thoughtful personal assistant.",
): Promise<Response> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Chat is not configured on the server yet." },
      { status: 503 },
    );
  }

  let connectionsUnavailable = !process.env.COMPOSIO_API_KEY;
  if (userId && process.env.COMPOSIO_API_KEY) {
    try {
      return await createAgentResponse(
        messages,
        signal,
        userId,
        resumeRunId,
        choice,
      );
    } catch {
      if (signal.aborted) throw signal.reason;
      if (resumeRunId)
        return Response.json(
          { error: "App connections are temporarily unavailable." },
          { status: 503 },
        );
      connectionsUnavailable = true;
    }
  }

  const expanded = userId ? await expandAttachments(messages, userId) : messages;
  const lastUser = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const query = userId && lastUser.trim() ? await embedOne(lastUser).catch(() => null) : null;
  const memory = userId ? await memoryContext(userId, query).catch(() => null) : null;
  const recalled = userId && memory?.enabled && memory.settings.historyRecall ? await recallContext(userId, query).catch(() => null) : null;
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5.6-luna",
      stream: true,
      messages: [
        {
          role: "system",
          content:
            preamble + " Be helpful and concise. When the user shares photos or files, look at them carefully, read any text in them, and use them as context. Do not claim to have browsed, used tools, saved information, or completed actions unless you actually have." +
            (connectionsUnavailable
              ? " App integrations are unavailable because the server connection setup needs attention. For a task requiring an app, explain that honestly. Normal conversation still works."
              : ""),
        },
        ...(memory?.context ? [{ role: "system", content: memory.context }] : []),
        ...(recalled ? [{ role: "system", content: recalled }] : []),
        ...expanded,
      ],
    }),
  });
}
