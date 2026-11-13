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
import { createGroup, createMate, deleteGroup, deleteMate, groupInputSchema, groupUpdateSchema, leaderSetupSchema, listMatesAndGroups, MateError, mateInputSchema, mateUpdateSchema, setupLeader, updateGroup, updateMate } from "./mates.js";
import { deleteAccount } from "./account.js";
import { cancelCodeRun, codeCard, ownedCodeRun } from "./code-runs.js";
import { renderPptx } from "./deck-pptx.js";
import { cancelDeck, deckFilename, deckView, ownedDeck, startDeckEdit, undoDeck } from "./decks.js";
import { recordVisit, referrerHost, visitStats } from "./site-visits.js";
import { keytermsFor, transcribe, transcriptionConfigured } from "./transcription.js";
import { CallError, callContext, callsConfigured, callTaskSchema, endCall, endCallSchema, getCall, inviteCallMate, inviteMateSchema, startCall, startCallSchema, startCallTask, verifyCallToken } from "./calls.js";
import { joinWaitlist, normalizeEmail, waitlistSize } from "./waitlist.js";
import { authorizeUrl, completeInstall, ConnectError, githubConfigured, installUrl, listInstallations, listRepos, safeReturn, verifyState } from "./github.js";
import { completeInstall as completeSlackInstall, completeLink, installUrl as slackInstallUrl, LinkError, linkUrl as slackLinkUrl, listLinks, slackConfigured, unlink, verifyInstallState } from "./slack.js";
import { handleSlackEvent, handleSlashCommand } from "./slack-events.js";
import { handleInteraction } from "./slack-delivery.js";
import { verifySlackSignature } from "./slack-security.js";
import { handleRecallEvent, leaveMeeting, MeetingError, meetingSession, startMeeting, startMeetingSchema, verifyRecallWebhook } from "./meetings.js";
import { analyzeAttachment, getAttachment, MAX_ATTACHMENT_BYTES, resolveContentType, saveAttachment } from "./attachments.js";
import {
  chatRequestSchema,
  requestChatCompletion,
  type ChatTurn,
} from "./chat.js";
import { adminAuthorized, setPlan, upgradeUrl } from "./usage/billing.js";
import { financeCosts, financeSummary, financeUser, GROUPS, type CostGroup } from "./usage/finance.js";
import { assertUsage, enforcement, UsageLimitError, usageState } from "./usage/gate.js";
import { PLAN_IDS } from "./usage/plans.js";
import { perMinute } from "./usage/prices.js";
import { recordUsage } from "./usage/record.js";
import { findDecks, present, presentationDeck, presentationState, PresentError, stopPresenting } from "./presentation.js";

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

/** The landing site, wherever it is served: its origins may call the /site routes. */
const siteOrigins = () => (process.env.SITE_ORIGINS ?? "https://agents.askorin.app,http://localhost:4321").split(",").map((origin) => origin.trim());

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
    // Landing-site analytics: public, cookie-free, and open only to the site's own origins.
    .use("/site/*", cors({ origin: (origin) => (siteOrigins().includes(origin) ? origin : siteOrigins()[0]!), allowMethods: ["GET", "POST"] }))
    .post("/site/visit", bodyLimit({ maxSize: 2_000 }), async (c) => {
      // Sent as text/plain by navigator.sendBeacon, which skips the CORS preflight.
      let body: { path?: unknown; referrer?: unknown } = {};
      try {
        body = JSON.parse(await c.req.text());
      } catch {}
      const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
      await recordVisit({
        path: body.path,
        referrer: typeof body.referrer === "string" ? body.referrer : undefined,
        ua: c.req.header("user-agent") ?? "",
        ip,
        siteHost: new URL(siteOrigins()[0]!).hostname,
      }).catch((error) => console.warn("site_visit_failed", { message: error instanceof Error ? error.message : String(error) }));
      return c.body(null, 204);
    })
    .get("/site/stats", async (c) => {
      const days = z.coerce.number().int().min(1).max(90).catch(30).parse(c.req.query("days"));
      c.header("cache-control", "public, max-age=30");
      const [stats, waiting] = await Promise.all([visitStats(days), waitlistSize()]);
      return c.json({ ...stats, waitlist: waiting });
    })
    // The meeting bot's camera page (agents.askorin.app/meet-bot) joins and leaves through these,
    // with the short-lived token in its link; nothing else about the meeting is reachable this way.
    .get("/site/meetings/:id/session", async (c) => {
      const session = await meetingSession(c.req.param("id"), c.req.query("t"));
      return session ? c.json(session) : c.json(failure("NOT_FOUND", "This meeting has ended", c.get("requestId")), 404);
    })
    .post("/site/meetings/:id/leave", async (c) => c.json({ ok: await leaveMeeting(c.req.param("id"), c.req.query("t")) }))
    // The deck the mate is presenting, for its share page (?s=) or its camera page as a fallback (?t=).
    .get("/site/meetings/:id/presentation", async (c) => {
      c.header("cache-control", "no-store");
      const state = await presentationState(c.req.param("id"), { share: c.req.query("s"), page: c.req.query("t") });
      return state ? c.json(state) : c.json(failure("NOT_FOUND", "This meeting has ended", c.get("requestId")), 404);
    })
    .get("/site/meetings/:id/presentation/deck", async (c) => {
      c.header("cache-control", "no-store");
      const deck = await presentationDeck(c.req.param("id"), { share: c.req.query("s"), page: c.req.query("t") });
      return deck ? c.json(deck) : c.json(failure("NOT_FOUND", "Nothing is being presented", c.get("requestId")), 404);
    })
    .post("/site/waitlist", bodyLimit({ maxSize: 2_000 }), async (c) => {
      let body: { email?: unknown; website?: unknown; referrer?: unknown } = {};
      try {
        body = await c.req.json();
      } catch {}
      // A hidden field people never see: bots fill it in and get a quiet, empty success.
      if (typeof body.website === "string" && body.website) return c.json({ position: null, already: false });
      const email = normalizeEmail(body.email);
      if (!email) return c.json(failure("INVALID_EMAIL", "That email doesn’t look right", c.get("requestId")), 400);
      const referrer = referrerHost(typeof body.referrer === "string" ? body.referrer : undefined, new URL(siteOrigins()[0]!).hostname);
      return c.json(await joinWaitlist(email, referrer));
    })
    .use("/v1/*", bodyLimit({ maxSize: 1_000_000 }))
    .get("/v1/capabilities", auth, (c) => c.json({ durableRuns: workerConfigured(), production: process.env.NODE_ENV === "production" }))
    .get("/v1/usage", auth, async (c) => {
      const state = await usageState(c.get("userId"));
      // Shadow mode measures without stopping anyone, so the app shouldn't say they're stopped.
      return c.json({ ...state, blocked: enforcement() === "on" ? state.blocked : null, enforced: enforcement() === "on", upgradeUrl: upgradeUrl() });
    })
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
    // Voice calls. The phone starts one; the voice agent, holding only the call's signed token,
    // reads its context, hands work off to the chat and reports the transcript.
    .post("/v1/calls", auth, validator("json", (value, c) => {
      const parsed = startCallSchema.safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_CALL", "Check who's on the call", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => {
      if (!callsConfigured()) return c.json(failure("CALLS_UNAVAILABLE", "Calls aren’t set up on this server yet", c.get("requestId")), 503);
      return c.json(await startCall(c.get("userId"), c.req.valid("json")), 201);
    })
    .get("/v1/calls/:id", auth, async (c) => c.json({ call: await getCall(c.get("userId"), c.req.param("id")) }))
    .get("/v1/calls/:id/agent/context", async (c) => {
      const userId = verifyCallToken(c.req.header("x-call-token"), c.req.param("id"));
      if (!userId) return c.json(failure("UNAUTHORIZED", "Invalid call token", c.get("requestId")), 401);
      return c.json(await callContext(userId, c.req.param("id")));
    })
    .post("/v1/calls/:id/agent/tasks", validator("json", (value, c) => {
      const parsed = callTaskSchema.safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_TASK", "Describe the task", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => {
      const userId = verifyCallToken(c.req.header("x-call-token"), c.req.param("id"));
      if (!userId) return c.json(failure("UNAUTHORIZED", "Invalid call token", c.get("requestId")), 401);
      return c.json(await startCallTask(userId, c.req.param("id"), c.req.valid("json")), 202);
    })
    .post("/v1/calls/:id/agent/mates", validator("json", (value, c) => {
      const parsed = inviteMateSchema.safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_MATES", "Choose a mate to add", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => {
      const userId = verifyCallToken(c.req.header("x-call-token"), c.req.param("id"));
      if (!userId) return c.json(failure("UNAUTHORIZED", "Invalid call token", c.get("requestId")), 401);
      return c.json(await inviteCallMate(userId, c.req.param("id"), c.req.valid("json")));
    })
    .post("/v1/calls/:id/agent/end", validator("json", (value, c) => {
      const parsed = endCallSchema.safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_TRANSCRIPT", "Invalid transcript", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => {
      const userId = verifyCallToken(c.req.header("x-call-token"), c.req.param("id"));
      if (!userId) return c.json(failure("UNAUTHORIZED", "Invalid call token", c.get("requestId")), 401);
      return c.json(await endCall(userId, c.req.param("id"), c.req.valid("json")));
    })
    // Presenting a deck in a meeting: the voice agent finds decks and moves through the slides.
    .get("/v1/calls/:id/agent/decks", async (c) => {
      const userId = verifyCallToken(c.req.header("x-call-token"), c.req.param("id"));
      if (!userId) return c.json(failure("UNAUTHORIZED", "Invalid call token", c.get("requestId")), 401);
      return c.json({ decks: await findDecks(userId, c.req.param("id"), c.req.query("q")) });
    })
    .post("/v1/calls/:id/agent/present", validator("json", (value, c) => {
      const parsed = z.object({ deckId: z.string().uuid(), slide: z.number().int().min(1).max(100) }).safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_SLIDE", "Choose a deck and a slide", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => {
      const userId = verifyCallToken(c.req.header("x-call-token"), c.req.param("id"));
      if (!userId) return c.json(failure("UNAUTHORIZED", "Invalid call token", c.get("requestId")), 401);
      return c.json(await present(userId, c.req.param("id"), c.req.valid("json")));
    })
    .post("/v1/calls/:id/agent/present/stop", async (c) => {
      const userId = verifyCallToken(c.req.header("x-call-token"), c.req.param("id"));
      if (!userId) return c.json(failure("UNAUTHORIZED", "Invalid call token", c.get("requestId")), 401);
      return c.json(await stopPresenting(userId, c.req.param("id")));
    })
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
    .post("/v1/devices/status", auth, validator("json", (value, c) => {
      const parsed = z.object({ token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/) }).safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_DEVICE", "Invalid device", c.get("requestId")), 400);
      return parsed.data;
    }), async c => {
      const [device] = await getDb().select({ enabled: deviceTokens.enabled }).from(deviceTokens).where(and(eq(deviceTokens.token, c.req.valid("json").token), eq(deviceTokens.clerkUserId, c.get("userId"))));
      return c.json({ enabled: device?.enabled === true });
    })
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
      await assertUsage(c.get("userId"), "attachment");
      const attachment = await saveAttachment(c.get("userId"), { name: file.name || "attachment", contentType, bytes: Buffer.from(await file.arrayBuffer()) });
      // Indexed while the user is still typing; the reply never waits on it.
      void analyzeAttachment(attachment.id).catch(() => console.warn("attachment_analysis_failed", { id: attachment.id }));
      return c.json({ attachment }, 201);
    })
    // Composer dictation: a short recorded clip in, text out. Clips stay under the 1 MB /v1 limit
    // (the app caps recordings at 3 minutes of 32 kbps speech audio).
    .post("/v1/transcribe", auth, async (c) => {
      if (!transcriptionConfigured()) return c.json(failure("TRANSCRIPTION_UNAVAILABLE", "Voice typing isn’t set up on this server yet", c.get("requestId")), 503);
      await assertUsage(c.get("userId"), "transcribe");
      // The phone sends the clip as a raw audio body; other clients may send multipart field "audio".
      const header = c.req.header("content-type") ?? "";
      let bytes: ArrayBuffer | null = null;
      let contentType = header.split(";")[0]!.trim();
      if (contentType.startsWith("audio/")) {
        bytes = await c.req.arrayBuffer().catch(() => null);
      } else {
        const audio = (await c.req.parseBody().catch(() => null))?.audio;
        if (audio instanceof File) {
          contentType = audio.type || "audio/mp4";
          bytes = await audio.arrayBuffer();
        }
      }
      if (!bytes?.byteLength) return c.json(failure("INVALID_AUDIO", "No recording was received", c.get("requestId")), 400);
      if (!contentType.startsWith("audio/")) return c.json(failure("INVALID_AUDIO", "That isn’t an audio recording", c.get("requestId")), 400);
      const names = await listMatesAndGroups(c.get("userId"))
        .then((list) => list.mates.map((mate) => mate.name))
        .catch(() => [] as string[]);
      const started = Date.now();
      try {
        const text = await transcribe(bytes, { contentType, keyterms: keytermsFor(names), signal: c.req.raw.signal });
        console.info("transcription_done", { requestId: c.get("requestId"), bytes: bytes.byteLength, ms: Date.now() - started, empty: !text });
        // The app records speech at 32 kbps, so the clip's length follows from its size.
        const seconds = Math.max(1, Math.round((bytes.byteLength * 8) / 32_000));
        void recordUsage({ userId: c.get("userId"), source: "transcribe", provider: "deepgram", seconds, costMicros: perMinute("TRANSCRIBE_MINUTE", seconds), estimated: true });
        return c.json({ text });
      } catch (error) {
        console.warn("transcription_failed", { requestId: c.get("requestId"), message: error instanceof Error ? error.message : String(error) });
        return c.json(failure("TRANSCRIPTION_FAILED", "Couldn’t transcribe that. Try again.", c.get("requestId")), 502);
      }
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
    // GitHub sends the browser here after an install or sign-in; the signed state says whose it is.
    .get("/v1/github/callback", async (c) => {
      const rawState = c.req.query("state") ?? "";
      const state = verifyState(rawState);
      const back = (status: string, reason?: string) =>
        c.redirect(`${state?.returnTo ?? safeReturn(undefined)}${state?.returnTo.includes("?") ? "&" : "?"}github=${status}${reason ? `&reason=${reason}` : ""}`);
      if (!state) {
        console.warn("github_connect_failed", { reason: "expired" });
        return back("failed", "expired");
      }
      const code = c.req.query("code");
      try {
        // No code: the install finished without signing in. Sign in now, then come back here.
        if (!code) return c.redirect(authorizeUrl(rawState));
        await completeInstall(state.userId, code);
        return back("connected");
      } catch (error) {
        const reason = error instanceof ConnectError ? error.reason : "error";
        console.warn("github_connect_failed", { reason, message: error instanceof Error ? error.message : String(error) });
        return back("failed", reason);
      }
    })
    .get("/v1/slack", auth, async (c) => {
      if (!slackConfigured()) return c.json({ configured: false as const, workspaces: [] });
      const links = await listLinks(c.get("userId"));
      return c.json({ configured: true as const, workspaces: links.map((link) => ({ id: link.teamId, name: link.teamName })) });
    })
    .get("/v1/slack/install", auth, (c) =>
      slackConfigured() ? c.json({ url: slackInstallUrl(c.get("userId"), safeReturn(c.req.query("returnTo"))) }) : c.json(failure("NOT_CONFIGURED", "Slack isn’t set up on this server yet.", c.get("requestId")), 503),
    )
    // Slack sends the browser here after "Allow"; the signed state says which Mates account started it.
    .get("/v1/slack/callback", async (c) => {
      const state = verifyInstallState(c.req.query("state") ?? "");
      const returnTo = safeReturn(state?.returnTo);
      const back = (status: string, reason?: string) => c.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}slack=${status}${reason ? `&reason=${reason}` : ""}`);
      if (!state) return back("failed", "expired");
      const code = c.req.query("code");
      if (!code) return back("failed", c.req.query("error") === "access_denied" ? "cancelled" : "oauth");
      try {
        await completeSlackInstall(state.userId, code);
        return back("connected");
      } catch (error) {
        console.warn("slack_install_failed", { message: error instanceof Error ? error.message : String(error) });
        return back("failed", "oauth");
      }
    })
    .post("/v1/slack/link", auth, validator("json", (value, c) => {
      const parsed = z.object({ token: z.string().min(10).max(1000) }).safeParse(value);
      return parsed.success ? parsed.data : c.json(failure("INVALID_LINK", "That link isn’t valid", c.get("requestId")), 400);
    }), async (c) => {
      try {
        return c.json(await completeLink(c.get("userId"), c.req.valid("json").token));
      } catch (error) {
        if (error instanceof LinkError) return c.json(failure("LINK_FAILED", error.message, c.get("requestId")), 400);
        throw error;
      }
    })
    .delete("/v1/slack/link/:teamId", auth, async (c) => {
      await unlink(c.get("userId"), c.req.param("teamId"));
      return c.json({ ok: true });
    })
    .post("/v1/meetings", auth, validator("json", (value, c) => {
      const parsed = startMeetingSchema.safeParse(value);
      return parsed.success ? parsed.data : c.json(failure("INVALID_MEETING", "Send a meeting link and a mate", c.get("requestId")), 400);
    }), async (c) => {
      try {
        return c.json(await startMeeting(c.get("userId"), c.req.valid("json")));
      } catch (error) {
        if (error instanceof MeetingError) return c.json(failure(error.code, error.message, c.get("requestId")), error.code === "NOT_CONFIGURED" ? 503 : error.code === "RECALL_FAILED" ? 502 : 400);
        throw error;
      }
    })
    .post("/v1/meetings/:id/leave", auth, async (c) => c.json({ ok: await leaveMeeting(c.req.param("id"), undefined, c.get("userId")) }))
    // Recall's bot status changes; signed with the workspace secret instead of a Clerk token.
    .post("/v1/recall/webhook", async (c) => {
      const raw = await c.req.text();
      if (!verifyRecallWebhook(raw, (name) => c.req.header(name))) return c.json(failure("BAD_SIGNATURE", "Not from Recall", c.get("requestId")), 401);
      void handleRecallEvent(JSON.parse(raw)).catch((error) => console.warn("recall_event_failed", { message: error instanceof Error ? error.message : String(error) }));
      return c.body(null, 200);
    })
    // Slack's own calls (events, /mates, buttons) carry no Clerk token: each is checked against the signing secret instead.
    .post("/v1/slack/events", async (c) => {
      const raw = await c.req.text();
      if (!verifySlackSignature(raw, c.req.header("x-slack-request-timestamp"), c.req.header("x-slack-signature"))) return c.json(failure("BAD_SIGNATURE", "Not from Slack", c.get("requestId")), 401);
      const body = JSON.parse(raw) as { type: string; challenge?: string };
      if (body.type === "url_verification") return c.json({ challenge: body.challenge });
      // Slack wants an answer within three seconds; the work carries on after it.
      void handleSlackEvent(body).catch((error) => console.warn("slack_event_failed", { message: error instanceof Error ? error.message : String(error) }));
      return c.body(null, 200);
    })
    .post("/v1/slack/commands", async (c) => {
      const raw = await c.req.text();
      if (!verifySlackSignature(raw, c.req.header("x-slack-request-timestamp"), c.req.header("x-slack-signature"))) return c.json(failure("BAD_SIGNATURE", "Not from Slack", c.get("requestId")), 401);
      const form = new URLSearchParams(raw);
      if (!form.get("text")?.trim()) return c.json({ response_type: "ephemeral", text: "Tell me what you need, like `/mates ask Ama to find a venue for Saturday`." });
      void handleSlashCommand(form).catch((error) => console.warn("slack_command_failed", { message: error instanceof Error ? error.message : String(error) }));
      return c.json({ response_type: "ephemeral", text: "Got it. Your mate will reply here." });
    })
    .post("/v1/slack/interactions", async (c) => {
      const raw = await c.req.text();
      if (!verifySlackSignature(raw, c.req.header("x-slack-request-timestamp"), c.req.header("x-slack-signature"))) return c.json(failure("BAD_SIGNATURE", "Not from Slack", c.get("requestId")), 401);
      const payload = JSON.parse(new URLSearchParams(raw).get("payload") ?? "{}");
      void handleInteraction(payload).catch((error) => console.warn("slack_interaction_failed", { message: error instanceof Error ? error.message : String(error) }));
      return c.body(null, 200);
    })
    // "Open Mates" buttons: Slack buttons need http links, so this page hands over to the app.
    .get("/v1/slack/open", (c) => {
      const to = c.req.query("to") === "connections" ? "connections" : "";
      const target = `mates://${to}`;
      return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${target}"><title>Open Mates</title><body style="font-family:system-ui;padding:32px;line-height:1.5"><h1 style="font-size:22px">Opening Mates…</h1><p>If nothing happens, open Mates on your phone, or <a href="${target}">tap here</a>.</p></body>`);
    })
    // The "Connect Mates" button in Slack lands here and opens the app with a signed, short-lived link token.
    .get("/v1/slack/connect", (c) => {
      const team = c.req.query("team") ?? "";
      const user = c.req.query("user") ?? "";
      if (!/^[A-Z0-9]{2,32}$/.test(team) || !/^[A-Z0-9]{2,32}$/.test(user)) return c.text("This link isn’t valid. Ask Mates in Slack for a new one.", 400);
      const target = slackLinkUrl(team, user);
      return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${target}"><title>Connect Mates</title><body style="font-family:system-ui;padding:32px;line-height:1.5"><h1 style="font-size:22px">Opening Mates…</h1><p>If nothing happens, open this page on your phone with Mates installed, or <a href="${target}">tap here</a>.</p></body>`);
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
    .get("/v1/decks/:id", auth, async (c) => {
      const row = await ownedDeck(c.get("userId"), c.req.param("id"));
      return row ? c.json(deckView(row)) : c.json(failure("NOT_FOUND", "Deck not found", c.get("requestId")), 404);
    })
    .post("/v1/decks/:id/edits", auth, async (c) => {
      const body = z.object({ instruction: z.string().trim().min(1).max(2_000), slideIds: z.array(z.string().max(40)).max(20).nullable().optional() }).safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json(failure("INVALID_EDIT", "Say what to change.", c.get("requestId")), 400);
      const result = await startDeckEdit(c.get("userId"), c.req.param("id"), body.data.instruction, body.data.slideIds ?? null);
      if ("error" in result) return c.json(failure("CONFLICT", result.error ?? "That change couldn't start.", c.get("requestId")), 409);
      return c.json({ card: result.card });
    })
    .post("/v1/decks/:id/undo", auth, async (c) => {
      const result = await undoDeck(c.get("userId"), c.req.param("id"));
      if (!result.row) return c.json(failure(result.status === 404 ? "NOT_FOUND" : "CONFLICT", result.error ?? "There's nothing to undo.", c.get("requestId")), result.status ?? 409);
      return c.json(deckView(result.row));
    })
    .post("/v1/decks/:id/cancel", auth, async (c) => {
      const row = await cancelDeck(c.get("userId"), c.req.param("id"));
      return row ? c.json(deckView(row)) : c.json(failure("CONFLICT", "This deck is no longer being made.", c.get("requestId")), 409);
    })
    .get("/v1/decks/:id/export.pptx", auth, async (c) => {
      const row = await ownedDeck(c.get("userId"), c.req.param("id"));
      if (!row) return c.json(failure("NOT_FOUND", "Deck not found", c.get("requestId")), 404);
      if (!row.slides.length || !["ready", "editing"].includes(row.status)) return c.json(failure("CONFLICT", "The deck isn't finished yet.", c.get("requestId")), 409);
      const bytes = await renderPptx({ title: row.title, theme: row.theme, meta: row.meta, slides: row.slides, sources: row.sources });
      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "content-disposition": deckFilename(row.title),
          "cache-control": "private, no-store",
        },
      });
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
    .post("/v1/leader", auth, validator("json", (value, c) => {
      const parsed = leaderSetupSchema.safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_MATE", "Check your mate's name, shape and colour", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => c.json({ mate: await setupLeader(c.get("userId"), c.req.valid("json")) }))
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
            "Your mate couldn’t respond right now. Please try again.",
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
            .refine((value) => /^(exp|exps|muse-clone|mates):\/\//.test(value)),
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
    .use("/internal/*", async (c, next) => {
      if (!adminAuthorized(c.req.header("x-admin-key"))) return c.json(failure("UNAUTHORIZED", "Admin key required", c.get("requestId")), 401);
      await next();
    })
    .put("/internal/users/:id/plan", validator("json", (value, c) => {
      const parsed = z.object({ plan: z.enum(PLAN_IDS), recordPayment: z.boolean().default(true), grossMicros: z.number().int().min(0).optional(), storeFeeMicros: z.number().int().min(0).optional() }).safeParse(value);
      if (!parsed.success) return c.json(failure("INVALID_PLAN", "Choose a plan: starter, plus, pro, max or none", c.get("requestId")), 400);
      return parsed.data;
    }), async (c) => {
      const body = c.req.valid("json");
      await setPlan(c.req.param("id"), body.plan, { period: body.recordPayment ? { grossMicros: body.grossMicros, storeFeeMicros: body.storeFeeMicros } : undefined });
      return c.json({ usage: await usageState(c.req.param("id")) });
    })
    .get("/internal/finance/summary", async (c) => {
      const month = /^\d{4}-\d{2}$/;
      const now = new Date().toISOString().slice(0, 7);
      const from = month.test(c.req.query("from") ?? "") ? c.req.query("from")! : now;
      const to = month.test(c.req.query("to") ?? "") ? c.req.query("to")! : now;
      return c.json(await financeSummary(from, to));
    })
    .get("/internal/finance/costs", async (c) => {
      const day = /^\d{4}-\d{2}-\d{2}$/;
      const today = new Date().toISOString().slice(0, 10);
      const from = day.test(c.req.query("from") ?? "") ? c.req.query("from")! : `${today.slice(0, 8)}01`;
      const to = day.test(c.req.query("to") ?? "") ? c.req.query("to")! : today;
      const groupBy = (Object.keys(GROUPS) as CostGroup[]).find((key) => key === c.req.query("groupBy")) ?? "source";
      return c.json({ from, to, groupBy, rows: await financeCosts(from, to, groupBy) });
    })
    .get("/internal/finance/users/:id", async (c) => c.json(await financeUser(c.req.param("id"))))
    .notFound((c) =>
      c.json(failure("NOT_FOUND", "Route not found", c.get("requestId")), 404),
    )
    .onError((error, c) => {
      if (error instanceof UsageLimitError) {
        const noPlan = error.reason === "no_plan";
        return c.json({ error: { code: noPlan ? "plan_required" : "usage_limit", message: error.message, requestId: c.get("requestId"), window: noPlan ? null : error.reason, resetsAt: error.resetsAt, plan: error.plan, upgradeUrl: upgradeUrl() } }, noPlan ? 402 : 429);
      }
      if (["IDEMPOTENCY_CONFLICT", "RUN_ALREADY_ACTIVE", "RESUME_CONFLICT", "ROUTINE_CONFLICT"].includes(error.message)) return c.json(failure("CONFLICT", "This task changed or is already running. Refresh before trying again.", c.get("requestId")), 409);
      if (error instanceof PresentError) return c.json(failure(error.code, error.message, c.get("requestId")), error.code === "NOT_LIVE" ? 409 : error.code === "NOT_FOUND" ? 404 : 422);
      if (error instanceof CallError) {
        const answers = { NOT_FOUND: [404, "Call or chat not found"], INVALID_MATES: [400, "Pick mates you have, up to four on a call"], ENDED: [409, "This call has ended"] } as const;
        const [status, message] = answers[error.code];
        return c.json(failure(error.code, message, c.get("requestId")), status);
      }
      if (error instanceof MateError) {
        const answers = {
          NAME_TAKEN: [409, "You already have a mate with that name"],
          LIMIT: [409, "You can have up to 20 mates"],
          DEFAULT_MATE: [409, "Your lead mate can't be removed"],
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
