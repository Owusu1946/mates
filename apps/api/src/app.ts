import { verifyToken as verifyClerkToken } from "@clerk/backend";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { delegations, deliveries, deviceTokens, findings, profiles, type Profile } from "./db/schema.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { validator } from "hono/validator";
import {
  disconnectApp,
  getApp,
  getIntegrationSession,
  IntegrationUnavailable,
  listApps,
} from "./integrations.js";
import {
  chatIdSchema,
  chatMetadataSchema,
  createChatStore,
  deletedMessagesSchema,
  savedMessageSchema,
  type ChatStore,
} from "./chats.js";
import { getEnv } from "./env.js";
import { browserView, browserInput, closeBrowser, pauseBrowser } from "./browser.js";
import { cancelRun, listRuns, runSnapshot, submissionSchema, submitRun, workerConfigured } from "./durable-runs.js";
import { changeRoutine, draftRoutine, editRoutine, listRoutines, routineHistory, routineSpecSchema, runRoutineNow } from "./scheduling.js";
import { retryDelivery } from "./delivery.js";
import { forgetAllMemories, forgetMemory, listMemories, memoryInputSchema, memorySettings, memorySettingsSchema, updateMemory, updateMemorySettings } from "./memory.js";
import { cancelReminder, upcomingReminders } from "./reminders.js";
import { runUndo } from "./undo.js";
import { missionForChat, setMissionStatus } from "./missions.js";
import { createGroup, createMate, deleteGroup, deleteMate, groupInputSchema, groupUpdateSchema, listMatesAndGroups, MateError, mateInputSchema, mateUpdateSchema, updateGroup, updateMate } from "./mates.js";
import { deleteAccount } from "./account.js";
import { cancelCodeRun, codeCard, ownedCodeRun } from "./code-runs.js";
import { completeInstall, GitHubError, githubConfigured, installUrl, listInstallations, listRepos, safeReturn, verifyState } from "./github.js";
import { analyzeAttachment, getAttachment, MAX_ATTACHMENT_BYTES, resolveContentType, saveAttachment } from "./attachments.js";
import {
  chatRequestSchema,
  requestChatCompletion,
  type ChatTurn,
} from "./chat.js";

type Variables = { requestId: string; userId: string };
type Dependencies = {
  verifyToken(token: string): Promise<{ sub?: string | null }>;
  findProfile(userId: string): Promise<Profile | null>;
  requestChat(
    messages: ChatTurn[],
    signal: AbortSignal,
    userId?: string,
    resumeRunId?: string,
    choice?: string,
  ): Promise<Response>;
  chats: ChatStore;
};

const defaults: Dependencies = {
  verifyToken: (token) =>
    verifyClerkToken(token, { secretKey: getEnv().CLERK_SECRET_KEY }),
  async findProfile(userId) {
    return (
      (
        await getDb()
          .select()
          .from(profiles)
          .where(eq(profiles.clerkUserId, userId))
          .limit(1)
      )[0] ?? null
    );
  },
  requestChat: requestChatCompletion,
  chats: createChatStore(),
};

const failure = (code: string, message: string, requestId: string) => ({
  error: { code, message, requestId },
});

export function createApp(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides };
  const auth = createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer "))
      return c.json(
        failure(
          "UNAUTHORIZED",
          "A bearer token is required",
          c.get("requestId"),
        ),
        401,
      );
    try {
      const claims = await dependencies.verifyToken(header.slice(7));
      if (!claims.sub) throw new Error("Token has no subject");
      c.set("userId", claims.sub);
    } catch {
      return c.json(
        failure(
          "UNAUTHORIZED",
          "The bearer token is invalid",
          c.get("requestId"),
        ),
        401,
      );
    }
    await next();
  });

  return new Hono<{ Variables: Variables }>()
    // "/v1/github/callback/" (as GitHub settings are often pasted) reaches "/v1/github/callback".
    .use("*", trimTrailingSlash())
    .use("*", async (c, next) => {
      c.set("requestId", c.req.header("x-request-id") ?? crypto.randomUUID());
      await next();
      c.header("x-request-id", c.get("requestId"));
    })
    .use("*", secureHeaders())
    .use(
      "/v1/*",
      cors({
        origin: (origin) => {
          const allowed = (
            process.env.ALLOWED_ORIGINS ?? "http://localhost:8081"
          ).split(",");
          return allowed.includes(origin) ? origin : allowed[0]!;
        },
        credentials: true,
      }),
    )
    .get("/health", (c) => c.json({ ok: true, service: "expojet-api" }))
    .use("/v1/*", bodyLimit({ maxSize: 1_000_000 }))
    .get("/v1/capabilities", auth, (c) => c.json({ durableRuns: workerConfigured(), production: process.env.NODE_ENV === "production" }))
    .use("/v1/runs/*", bodyLimit({ maxSize: 150_000 }))
    .post("/v1/runs", bodyLimit({ maxSize: 150_000 }), auth, validator("json", (value, c) => {
      const parsed = submissionSchema.safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_RUN", "Invalid run request", c.get("requestId")), 400);
      return parsed.data;
    }), async c => {
      const run = await submitRun(c.get("userId"), c.req.valid("json"));
      return c.json({ runId: run.id, status: run.status }, 202);
    })
    .get("/v1/runs", auth, async c => c.json({ runs: await listRuns(c.get("userId"), c.req.query("chatId")) }))
    .get("/v1/runs/:id", auth, async c => {
      const after = z.coerce.number().int().min(0).safeParse(c.req.query("after") ?? 0);
      if (!after.success) return c.json(failure("INVALID_CURSOR", "Invalid cursor", c.get("requestId")), 400);
      const snapshot = await runSnapshot(c.get("userId"), c.req.param("id"), after.data);
      return snapshot ? c.json(snapshot) : c.json(failure("NOT_FOUND", "Run not found", c.get("requestId")), 404);
    })
    .post("/v1/runs/:id/cancel", auth, async c => (await cancelRun(c.get("userId"), c.req.param("id"))) ? c.json({ ok: true }) : c.json(failure("NOT_FOUND", "Run not found", c.get("requestId")), 404))
    .post("/v1/schedules/draft", auth, validator("json", (value, c) => {
      const parsed = routineSpecSchema.safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_SCHEDULE", "Check the time, timezone and task details", c.get("requestId")), 400);
      return parsed.data;
    }), async c => c.json({ routine: await draftRoutine(c.get("userId"), c.req.valid("json")) }, 201))
    .get("/v1/schedules", auth, async c => c.json({ routines: await listRoutines(c.get("userId")) }))
    .use("/v1/schedules/:id/*", async (c, next) => {
      if (!z.string().uuid().safeParse(c.req.param("id")).success) return c.json(failure("INVALID_ID", "Invalid schedule", c.get("requestId")), 400);
      await next();
    })
    .patch("/v1/schedules/:id", auth, validator("json", (value, c) => {
      if (!z.string().uuid().safeParse(c.req.param("id")).success) return c.json(failure("INVALID_ID", "Invalid schedule", c.get("requestId")), 400);
      const parsed = z.object({ spec: routineSpecSchema, version: z.number().int().positive() }).safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_SCHEDULE", "Check the routine details", c.get("requestId")), 400);
      return parsed.data;
    }), async c => {
      const { spec, version } = c.req.valid("json");
      const routine = await editRoutine(c.get("userId"), c.req.param("id"), spec, version);
      return routine ? c.json({ routine }) : c.json(failure("CONFLICT", "Routine changed. Refresh and try again.", c.get("requestId")), 409);
    })
    .post("/v1/schedules/:id/control", auth, validator("json", (value, c) => {
      const parsed = z.object({ action: z.enum(["confirm", "pause", "resume", "cancel"]), version: z.number().int().positive() }).safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_ACTION", "Choose a valid action", c.get("requestId")), 400);
      return parsed.data;
    }), async c => {
      const { action, version } = c.req.valid("json");
      const routine = await changeRoutine(c.get("userId"), c.req.param("id"), action, version);
      return routine ? c.json({ routine }) : c.json(failure("CONFLICT", "Routine changed. Refresh and try again.", c.get("requestId")), 409);
    })
    .post("/v1/schedules/:id/run", auth, validator("json", (value, c) => {
      const parsed = z.object({ requestKey: z.string().uuid() }).safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_KEY", "Invalid request key", c.get("requestId")), 400);
      return parsed.data;
    }), async c => c.json({ run: await runRoutineNow(c.get("userId"), c.req.param("id"), c.req.valid("json").requestKey) }, 202))
    .get("/v1/schedules/:id/runs", auth, async c => {
      const runs = await routineHistory(c.get("userId"), c.req.param("id"));
      return runs ? c.json({ runs }) : c.json(failure("NOT_FOUND", "Routine not found", c.get("requestId")), 404);
    })
    .get("/v1/feed", auth, async c => c.json({ items: await getDb().select({ id: findings.delegationId, title: findings.title, summary: findings.summary, readAt: findings.readAt, createdAt: findings.createdAt, status: delegations.status, chatId: delegations.chatId }).from(findings).innerJoin(delegations, eq(findings.delegationId, delegations.id)).where(eq(findings.clerkUserId, c.get("userId"))).orderBy(desc(findings.createdAt)).limit(100) }))
    .post("/v1/feed/:id/read", auth, async c => {
      if (!z.string().uuid().safeParse(c.req.param("id")).success) return c.json(failure("INVALID_ID", "Invalid finding", c.get("requestId")), 400);
      const rows = await getDb().update(findings).set({ readAt: new Date() }).where(and(eq(findings.delegationId, c.req.param("id")), eq(findings.clerkUserId, c.get("userId")))).returning({ id: findings.delegationId });
      return rows.length ? c.json({ ok: true }) : c.json(failure("NOT_FOUND", "Finding not found", c.get("requestId")), 404);
    })
    .get("/v1/runs/:id/deliveries", auth, async c => {
      if (!(await runSnapshot(c.get("userId"), c.req.param("id")))) return c.json(failure("NOT_FOUND", "Run not found", c.get("requestId")), 404);
      return c.json({ deliveries: await getDb().select({ id: deliveries.id, status: deliveries.status, error: deliveries.error }).from(deliveries).where(eq(deliveries.delegationId, c.req.param("id"))) });
    })
    .post("/v1/runs/:id/deliveries/retry", auth, async c => (await retryDelivery(c.get("userId"), c.req.param("id"))) ? c.json({ ok: true }) : c.json(failure("NOT_FOUND", "Run not found", c.get("requestId")), 404))
    .post("/v1/devices/disable", auth, validator("json", (value, c) => {
      const parsed = z.object({ token: z.string().min(1).max(300) }).safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_DEVICE", "Invalid device", c.get("requestId")), 400);
      return parsed.data;
    }), async c => {
      await getDb().delete(deviceTokens).where(and(eq(deviceTokens.token, c.req.valid("json").token), eq(deviceTokens.clerkUserId, c.get("userId"))));
      return c.json({ ok: true });
    })
    .post("/v1/devices", auth, validator("json", (value, c) => {
      const parsed = z.object({ token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/), enabled: z.boolean(), timezone: routineSpecSchema.shape.timezone, quietStart: z.number().int().min(0).max(23), quietEnd: z.number().int().min(0).max(23) }).safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_DEVICE", "Invalid notification settings", c.get("requestId")), 400);
      return parsed.data;
    }), async c => {
      const settings = c.req.valid("json");
      const [existing] = await getDb().select().from(deviceTokens).where(eq(deviceTokens.token, settings.token));
      if (existing && existing.clerkUserId !== c.get("userId")) return c.json(failure("CONFLICT", "This device is registered to another account", c.get("requestId")), 409);
      await getDb().insert(deviceTokens).values({ ...settings, clerkUserId: c.get("userId"), updatedAt: new Date() }).onConflictDoUpdate({ target: deviceTokens.token, set: { ...settings, updatedAt: new Date() }, setWhere: eq(deviceTokens.clerkUserId, c.get("userId")) });
      return c.json({ ok: true });
    })
    .post("/v1/attachments", bodyLimit({ maxSize: MAX_ATTACHMENT_BYTES + 64_000, onError: (c) => c.json(failure("TOO_LARGE", "Files must be 4 MB or smaller", c.get("requestId")), 413) }), auth, async (c) => {
      const body = await c.req.parseBody().catch(() => null);
      const file = body?.file;
      if (!(file instanceof File)) return c.json(failure("INVALID_FILE", "Choose a file to attach", c.get("requestId")), 400);
      const contentType = resolveContentType(file.name, file.type);
      if (!contentType) return c.json(failure("UNSUPPORTED_FILE", "Attach a photo, PDF, or text file", c.get("requestId")), 415);
      if (!file.size || file.size > MAX_ATTACHMENT_BYTES) return c.json(failure("TOO_LARGE", "Files must be 4 MB or smaller", c.get("requestId")), 413);
      const attachment = await saveAttachment(c.get("userId"), { name: file.name || "attachment", contentType, bytes: Buffer.from(await file.arrayBuffer()) });
      // Indexed while the user is still typing; the reply never waits on it.
      void analyzeAttachment(attachment.id).catch(() => console.warn("attachment_analysis_failed", { id: attachment.id }));
      return c.json({ attachment }, 201);
    })
    .get("/v1/attachments/:id", auth, async (c) => {
      const row = await getAttachment(c.get("userId"), c.req.param("id"));
      if (!row) return c.json(failure("NOT_FOUND", "Attachment not found", c.get("requestId")), 404);
      // Ids are immutable, so a device can cache the bytes forever.
      return c.body(new Uint8Array(row.data), 200, { "content-type": row.contentType, "cache-control": "private, max-age=31536000, immutable", "content-length": String(row.size) });
    })
    .get("/v1/github", auth, async (c) => {
      if (!githubConfigured()) return c.json({ configured: false as const, installations: [], repos: [] });
      const userId = c.get("userId");
      const [installations, repos] = await Promise.all([listInstallations(userId), listRepos(userId).catch(() => [])]);
      return c.json({ configured: true as const, installations: installations.map((item) => ({ id: item.installationId, account: item.accountLogin })), repos: repos.map((repo) => ({ fullName: repo.fullName, private: repo.private })) });
    })
    .get("/v1/github/install", auth, (c) =>
      githubConfigured() ? c.json({ url: installUrl(c.get("userId"), c.req.query("returnTo")) }) : c.json(failure("NOT_CONFIGURED", "GitHub isn’t set up on this server yet.", c.get("requestId")), 503),
    )
    // GitHub sends the browser here after an install; the signed state says whose it is.
    .get("/v1/github/callback", async (c) => {
      const state = verifyState(c.req.query("state") ?? "");
      const back = (status: string) => c.redirect(`${state?.returnTo ?? safeReturn(undefined)}${state?.returnTo.includes("?") ? "&" : "?"}github=${status}`);
      const userId = state?.userId;
      const installationId = Number(c.req.query("installation_id"));
      const code = c.req.query("code");
      if (!userId || !Number.isSafeInteger(installationId) || !code) return back("failed");
      try {
        await completeInstall(userId, installationId, code);
        return back("connected");
      } catch (error) {
        if (!(error instanceof GitHubError)) console.error("github_install_failed", error instanceof Error ? error.message : error);
        return back("failed");
      }
    })
    .get("/v1/code-runs/:id", auth, async (c) => {
      if (!z.string().uuid().safeParse(c.req.param("id")).success) return c.json(failure("INVALID_ID", "Invalid run", c.get("requestId")), 400);
      const run = await ownedCodeRun(c.get("userId"), c.req.param("id"));
      return run ? c.json({ card: codeCard(run) }) : c.json(failure("NOT_FOUND", "Run not found", c.get("requestId")), 404);
    })
    .post("/v1/code-runs/:id/cancel", auth, async (c) => {
      if (!z.string().uuid().safeParse(c.req.param("id")).success) return c.json(failure("INVALID_ID", "Invalid run", c.get("requestId")), 400);
      const run = await cancelCodeRun(c.get("userId"), c.req.param("id"));
      return run ? c.json({ card: codeCard(run) }) : c.json(failure("CONFLICT", "This run has already finished.", c.get("requestId")), 409);
    })
    .get("/v1/missions", auth, async (c) => {
      const chatId = chatIdSchema.safeParse(c.req.query("chatId"));
      if (!chatId.success) return c.json(failure("INVALID_CHAT_ID", "Invalid chat ID", c.get("requestId")), 400);
      return c.json({ mission: await missionForChat(c.get("userId"), chatId.data) });
    })
    .post("/v1/missions/:id/:action{pause|resume|stop}", auth, async (c) => {
      const mission = await setMissionStatus(c.get("userId"), c.req.param("id"), c.req.param("action") as "pause" | "resume" | "stop");
      return mission ? c.json({ mission }) : c.json(failure("CONFLICT", "This mission can't do that right now.", c.get("requestId")), 409);
    })
    .get("/v1/mates", auth, async (c) => c.json(await listMatesAndGroups(c.get("userId"))))
    .post("/v1/mates", auth, validator("json", (value, c) => {
      const parsed = mateInputSchema.safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_MATE", "Give your mate a name, a role and a colour", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => c.json({ mate: await createMate(c.get("userId"), c.req.valid("json")) }, 201))
    .patch("/v1/mates/:id", auth, validator("json", (value, c) => {
      const parsed = mateUpdateSchema.safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_MATE", "Check the mate's details", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => c.json({ mate: await updateMate(c.get("userId"), c.req.param("id"), c.req.valid("json")) }))
    .delete("/v1/mates/:id", auth, async (c) => {
      await deleteMate(c.get("userId"), c.req.param("id"));
      return c.json({ ok: true });
    })
    .post("/v1/groups", auth, validator("json", (value, c) => {
      const parsed = groupInputSchema.safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_GROUP", "Name the group and pick 2 to 8 mates", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => c.json({ group: await createGroup(c.get("userId"), c.req.valid("json")) }, 201))
    .patch("/v1/groups/:chatId", auth, validator("json", (value, c) => {
      const parsed = groupUpdateSchema.safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_GROUP", "Check the group's details", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => c.json({ group: await updateGroup(c.get("userId"), c.req.param("chatId"), c.req.valid("json")) }))
    .delete("/v1/groups/:chatId", auth, async (c) => {
      await deleteGroup(c.get("userId"), c.req.param("chatId"));
      return c.json({ ok: true });
    })
    .post("/v1/undo/:id", auth, async (c) => {
      const outcome = await runUndo(c.get("userId"), c.req.param("id"));
      if (outcome === "done") return c.json({ ok: true });
      return outcome === "not_found"
        ? c.json(failure("NOT_FOUND", "This can no longer be undone.", c.get("requestId")), 404)
        : c.json(failure("UNDO_FAILED", "Couldn’t undo that. Check the app directly.", c.get("requestId")), 502);
    })
    .get("/v1/reminders", auth, async (c) => c.json({ reminders: await upcomingReminders(c.get("userId")) }))
    .post("/v1/reminders/:id/cancel", auth, async (c) =>
      (await cancelReminder(c.get("userId"), c.req.param("id"))) ? c.json({ ok: true }) : c.json(failure("NOT_FOUND", "Reminder not found", c.get("requestId")), 404))
    .get("/v1/memories", auth, async (c) => c.json({ memories: await listMemories(c.get("userId")), settings: await memorySettings(c.get("userId")) }))
    .patch("/v1/memories/:id", auth, validator("json", (value, c) => {
      const parsed = memoryInputSchema.partial().safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_MEMORY", "Write the memory as a short sentence", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => {
      const memory = await updateMemory(c.get("userId"), c.req.param("id"), c.req.valid("json"));
      return memory ? c.json({ memory }) : c.json(failure("NOT_FOUND", "Memory not found", c.get("requestId")), 404);
    })
    .delete("/v1/memories/:id", auth, async (c) =>
      (await forgetMemory(c.get("userId"), c.req.param("id"))) ? c.json({ ok: true }) : c.json(failure("NOT_FOUND", "Memory not found", c.get("requestId")), 404))
    .delete("/v1/memories", auth, async (c) => {
      await forgetAllMemories(c.get("userId"));
      return c.json({ ok: true });
    })
    .patch("/v1/memory-settings", auth, validator("json", (value, c) => {
      const parsed = memorySettingsSchema.safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_SETTINGS", "Invalid memory settings", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => c.json({ settings: await updateMemorySettings(c.get("userId"), c.req.valid("json")) }))
    .delete("/v1/account", auth, async (c) => {
      try {
        await deleteAccount(c.get("userId"));
        return c.json({ deleted: true });
      } catch {
        return c.json(failure("ACCOUNT_DELETE_FAILED", "Your account couldn’t be fully deleted. Please try again.", c.get("requestId")), 502);
      }
    })
    .get("/v1/me", auth, async (c) => {
      const userId = c.get("userId");
      return c.json({
        user: { id: userId },
        profile: await dependencies.findProfile(userId),
      });
    })
    .use("/v1/chats/*", bodyLimit({ maxSize: 1_000_000 }))
    .use("/v1/chats/:id/*", async (c, next) => {
      if (!chatIdSchema.safeParse(c.req.param("id")).success)
        return c.json(
          failure("INVALID_CHAT_ID", "Invalid chat ID", c.get("requestId")),
          400,
        );
      await next();
    })
    .get("/v1/chats", auth, async (c) =>
      c.json({ chats: await dependencies.chats.list(c.get("userId")) }),
    )
    .put("/v1/chats/:id", auth, async (c) => {
      const id = c.req.param("id");
      if (!chatIdSchema.safeParse(id).success)
        return c.json(
          failure("INVALID_CHAT_ID", "Invalid chat ID", c.get("requestId")),
          400,
        );
      const chat = await dependencies.chats.initialize(c.get("userId"), id);
      if (!chat)
        return c.json(
          failure("NOT_FOUND", "Chat not found", c.get("requestId")),
          404,
        );
      return c.json({ chat });
    })
    .get("/v1/chats/:id", auth, async (c) => {
      const chat = await dependencies.chats.get(
        c.get("userId"),
        c.req.param("id"),
      );
      if (!chat)
        return c.json(
          failure("NOT_FOUND", "Chat not found", c.get("requestId")),
          404,
        );
      return c.json({ chat });
    })
    .patch("/v1/chats/:id", auth, async (c) => {
      const parsed = chatMetadataSchema.safeParse(
        await c.req.json().catch(() => null),
      );
      if (!parsed.success)
        return c.json(
          failure("INVALID_CHAT", "Invalid chat metadata", c.get("requestId")),
          400,
        );
      const chat = await dependencies.chats.update(
        c.get("userId"),
        c.req.param("id"),
        parsed.data,
      );
      if (!chat)
        return c.json(
          failure("NOT_FOUND", "Chat not found", c.get("requestId")),
          404,
        );
      return c.json({ chat });
    })
    .delete("/v1/chats/:id", auth, async (c) => {
      if (
        !(await dependencies.chats.delete(c.get("userId"), c.req.param("id")))
      )
        return c.json(
          failure("NOT_FOUND", "Chat not found", c.get("requestId")),
          404,
        );
      return c.json({ ok: true });
    })
    .get("/v1/chats/:id/messages", auth, async (c) => {
      const messages = await dependencies.chats.history(
        c.get("userId"),
        c.req.param("id"),
      );
      if (!messages)
        return c.json(
          failure("NOT_FOUND", "Chat not found", c.get("requestId")),
          404,
        );
      return c.json({ messages });
    })
    .put("/v1/chats/:id/messages", auth, async (c) => {
      const parsed = savedMessageSchema.safeParse(
        await c.req.json().catch(() => null),
      );
      if (!parsed.success)
        return c.json(
          failure("INVALID_MESSAGE", "Invalid message", c.get("requestId")),
          400,
        );
      if (
        !(await dependencies.chats.save(
          c.get("userId"),
          c.req.param("id"),
          parsed.data,
        ))
      )
        return c.json(
          failure("NOT_FOUND", "Chat not found", c.get("requestId")),
          404,
        );
      return c.json({ ok: true });
    })
    .delete("/v1/chats/:id/messages", auth, async (c) => {
      const parsed = deletedMessagesSchema.safeParse(
        await c.req.json().catch(() => null),
      );
      if (!parsed.success)
        return c.json(
          failure("INVALID_MESSAGE", "Invalid message IDs", c.get("requestId")),
          400,
        );
      if (
        !(await dependencies.chats.deleteMessages(
          c.get("userId"),
          c.req.param("id"),
          parsed.data.ids,
        ))
      )
        return c.json(
          failure("NOT_FOUND", "Chat not found", c.get("requestId")),
          404,
        );
      return c.json({ ok: true });
    })
    .post("/v1/chat", auth, async (c) => {
      if (process.env.NODE_ENV === "production") return c.json(failure("DURABLE_REQUIRED", "Update the app to use background runs", c.get("requestId")), 426);
      const body = await c.req.json().catch(() => null);
      const parsed = chatRequestSchema.safeParse(body);
      if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") {
        return c.json(
          failure(
            "INVALID_CHAT",
            "Send a conversation ending with a user message",
            c.get("requestId"),
          ),
          400,
        );
      }
      const upstream = await dependencies.requestChat(
        parsed.data.messages,
        c.req.raw.signal,
        c.get("userId"),
        parsed.data.resumeRunId,
        parsed.data.choice,
      );
      if (!upstream.ok || !upstream.body) {
        return c.json(
          failure(
            "CHAT_UNAVAILABLE",
            "Cooper could not respond right now. Please try again.",
            c.get("requestId"),
          ),
          upstream.status === 503 ? 503 : 502,
        );
      }
      return c.body(upstream.body, 200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
      });
    })
    .get("/v1/apps", auth, async (c) => {
      const session = await getIntegrationSession(c.get("userId"));
      return c.json(
        await listApps(session, {
          search: c.req.query("search")?.slice(0, 120),
          cursor: c.req.query("cursor"),
          connected: c.req.query("connected") === "true" ? true : undefined,
        }),
      );
    })
    .get("/v1/apps/:slug", auth, async (c) => {
      const app = await getApp(
        await getIntegrationSession(c.get("userId")),
        c.req.param("slug"),
      );
      if (!app)
        return c.json(
          failure("NOT_FOUND", "App not found", c.get("requestId")),
          404,
        );
      return c.json({ app });
    })
    .post("/v1/apps/:slug/connect", auth, async (c) => {
      const body = z
        .object({
          callbackUrl: z
            .string()
            .max(500)
            .refine((value) => /^(exp|exps|muse-clone):\/\//.test(value)),
        })
        .safeParse(await c.req.json().catch(() => null));
      if (!body.success)
        return c.json(
          failure(
            "INVALID_CALLBACK",
            "Invalid app callback",
            c.get("requestId"),
          ),
          400,
        );
      const session = await getIntegrationSession(c.get("userId"));
      const app = await getApp(session, c.req.param("slug"));
      if (!app)
        return c.json(
          failure("NOT_FOUND", "App not found", c.get("requestId")),
          404,
        );
      if (app.connected || app.noAuth)
        return c.json({ connected: true, connectUrl: null });
      const request = await session.authorize(app.slug, {
        callbackUrl: body.data.callbackUrl,
      });
      return c.json({
        connected: false,
        connectUrl: request.redirectUrl ?? null,
      });
    })
    .delete("/v1/apps/:slug", auth, async (c) => {
      await disconnectApp(c.get("userId"), c.req.param("slug"));
      return c.json({ ok: true });
    })
    .get("/v1/browser/:id", auth, async (c) => {
      try { return c.json(await browserView(c.req.param("id"), c.get("userId"))); }
      catch { return c.json(failure("BROWSER_UNAVAILABLE", "This browser is unavailable or has expired.", c.get("requestId")), 404); }
    })
    .post("/v1/browser/:id/input", auth, validator("json", (value, c) => {
      const parsed = z.object({ text: z.string().max(2000).optional(), key: z.enum(["Enter", "Tab", "Backspace", "Escape"]).optional() }).refine(v => v.text !== undefined || v.key).safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_INPUT", "Enter text or a supported key.", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => {
      const input = c.req.valid("json");
      try { await browserInput(c.req.param("id"), c.get("userId"), input.text, input.key); return c.json({ ok: true }); }
      catch { return c.json(failure("BROWSER_UNAVAILABLE", "Pause the browser before typing, or start a fresh request if it expired.", c.get("requestId")), 409); }
    })
    .post("/v1/browser/:id/pause", auth, async (c) => {
      try { return c.json(await pauseBrowser(c.req.param("id"), c.get("userId"))); }
      catch { return c.json(failure("BROWSER_UNAVAILABLE", "Browser session not found.", c.get("requestId")), 404); }
    })
    .post("/v1/browser/:id/close", auth, async (c) => {
      try { await closeBrowser(c.req.param("id"), c.get("userId"), "cancelled"); return c.json({ ok: true }); }
      catch { return c.json(failure("BROWSER_UNAVAILABLE", "Browser session not found.", c.get("requestId")), 404); }
    })
    .notFound((c) =>
      c.json(failure("NOT_FOUND", "Route not found", c.get("requestId")), 404),
    )
    .onError((error, c) => {
      if (["IDEMPOTENCY_CONFLICT", "RUN_ALREADY_ACTIVE", "RESUME_CONFLICT", "ROUTINE_CONFLICT"].includes(error.message)) return c.json(failure("CONFLICT", "This task changed or is already running. Refresh before trying again.", c.get("requestId")), 409);
      if (error instanceof MateError) {
        const answers = {
          NAME_TAKEN: [409, "You already have a mate with that name"],
          LIMIT: [409, "You can have up to 20 mates"],
          DEFAULT_MATE: [409, "Cooper can't be removed"],
          NOT_FOUND: [404, "Mate or group not found"],
          INVALID_MEMBERS: [400, "Pick 2 to 8 of your mates"],
        } as const;
        const [status, message] = answers[error.code];
        return c.json(failure(error.code, message, c.get("requestId")), status);
      }
      if (error.message === "WORKER_NOT_CONFIGURED") return c.json(failure("WORKER_UNAVAILABLE", "Background execution is not configured yet.", c.get("requestId")), 503);
      if (error instanceof IntegrationUnavailable)
        return c.json(
          failure("CONNECTIONS_UNAVAILABLE", error.message, c.get("requestId")),
          503,
        );
      console.error("api_request_failed", { requestId: c.get("requestId"), name: error.name });
      return c.json(
        failure(
          "INTERNAL_ERROR",
          "An unexpected error occurred",
          c.get("requestId"),
        ),
        500,
      );
    });
}

export const app = createApp();
export type AppType = ReturnType<typeof createApp>;
