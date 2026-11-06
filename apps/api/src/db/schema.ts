import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  uniqueIndex,
  bigserial,
  bigint,
  customType,
  vector,
  real,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    displayName: text("display_name"),
    /** Memory switches; both default on, like ChatGPT's. */
    memoryEnabled: boolean("memory_enabled").notNull().default(true),
    autoMemory: boolean("auto_memory").notNull().default(true),
    /** Lets Cooper search past chats and shared files, like ChatGPT's "reference chat history". */
    historyRecall: boolean("history_recall").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("profiles_clerk_user_id_idx").on(table.clerkUserId)],
);

export type Profile = typeof profiles.$inferSelect;

export const chats = pgTable(
  "chats",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    title: text("title").notNull().default("New chat"),
    status: text("status")
      .$type<"regular" | "archived">()
      .notNull()
      .default("regular"),
    /** "mate": one ongoing chat with a mate; "group": several mates; older chats stay "legacy". */
    kind: text("kind")
      .$type<"legacy" | "mate" | "group" | "routine">()
      .notNull()
      .default("legacy"),
    mateId: uuid("mate_id").references(() => mates.id, { onDelete: "cascade" }),
    leaderMateId: uuid("leader_mate_id").references(() => mates.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("chats_user_updated_idx").on(table.clerkUserId, table.updatedAt),
    uniqueIndex("chats_mate_idx").on(table.mateId),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    parentId: text("parent_id"),
    message: jsonb("message").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.id] }),
    // The sidebar preview reads each chat's newest message.
    index("chat_messages_latest_idx").on(table.chatId, table.createdAt),
  ],
);

export const integrationSessions = pgTable("integration_sessions", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  sessionId: text("session_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    sessionId: text("session_id").notNull(),
    status: text("status").notNull(),
    pendingToolkit: text("pending_toolkit"),
    messages: jsonb("messages").$type<Record<string, unknown>[]>().notNull(),
    /** In a group, the hand-offs still to run after this mate, kept while it waits on the user. */
    groupQueue: jsonb("group_queue").$type<{ mateId: string; task: string; assignments: { mateId: string; task: string }[]; replies: { name: string; text: string }[] }>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("agent_runs_user_idx").on(table.clerkUserId)],
);

export const browserSessions = pgTable("browser_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  runId: uuid("run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  status: text("status").notNull().default("running"),
  url: text("url").notNull().default("about:blank"),
  title: text("title").notNull().default("Browser"),
  steps: jsonb("steps").$type<{ label: string; state: "running" | "done" | "waiting" | "error" }[]>().notNull().default([]),
  pendingAction: jsonb("pending_action").$type<Record<string, unknown>>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const delegations = pgTable("delegations", {
  id: uuid("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  chatId: text("chat_id").references(() => chats.id, { onDelete: "set null" }),
  requestKey: text("request_key").notNull(),
  requestHash: text("request_hash").notNull(),
  request: jsonb("request").$type<Record<string, unknown>>().notNull(),
  assistantMessageId: text("assistant_message_id").notNull(),
  parentId: text("parent_id"),
  agentRunId: uuid("agent_run_id"),
  providerRunId: text("provider_run_id"),
  status: text("status").notNull().default("queued"),
  sequence: integer("sequence").notNull().default(0),
  content: jsonb("content").$type<Record<string, unknown>[]>().notNull().default([]),
  pendingTool: jsonb("pending_tool").$type<Record<string, unknown>>(),
  cancelRequested: boolean("cancel_requested").notNull().default(false),
  error: text("error"),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("delegations_owner_key").on(t.clerkUserId, t.requestKey), index("delegations_owner_chat").on(t.clerkUserId, t.chatId), uniqueIndex("delegations_active_chat").on(t.chatId).where(sql`status IN ('queued','running')`)]);

export const submissionOutbox = pgTable("submission_outbox", {
  delegationId: uuid("delegation_id").primaryKey().references(() => delegations.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});

export const runEvents = pgTable("run_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  delegationId: uuid("delegation_id").notNull().references(() => delegations.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("run_events_sequence").on(t.delegationId, t.sequence)]);

export const routines = pgTable("routines", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  chatId: text("chat_id").references(() => chats.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  spec: jsonb("spec").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("routines_due").on(t.status, t.nextRunAt), index("routines_owner").on(t.clerkUserId)]);

export const routineOccurrences = pgTable("routine_occurrences", {
  id: uuid("id").defaultRandom().primaryKey(),
  routineId: uuid("routine_id").notNull().references(() => routines.id, { onDelete: "cascade" }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  version: integer("version").notNull(),
  delegationId: uuid("delegation_id").notNull().references(() => delegations.id),
}, (t) => [uniqueIndex("routine_occurrence_key").on(t.routineId, t.scheduledFor, t.version)]);

export const findings = pgTable("findings", {
  delegationId: uuid("delegation_id").primaryKey().references(() => delegations.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("findings_owner").on(t.clerkUserId, t.createdAt)]);

export const deviceTokens = pgTable("device_tokens", {
  token: text("token").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  timezone: text("timezone").notNull().default("Africa/Accra"),
  quietStart: integer("quiet_start").notNull().default(22),
  quietEnd: integer("quiet_end").notNull().default(8),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deliveries = pgTable("deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  delegationId: uuid("delegation_id").notNull().references(() => delegations.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  receiptId: text("receipt_id"),
  error: text("error"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("delivery_result_device").on(t.delegationId, t.token)]);

// Hex in both directions so bytes survive the Neon HTTP driver's JSON transport.
const bytea = customType<{ data: Buffer; driverData: string | Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => `\\x${value.toString("hex")}`,
  fromDriver: (value) => (Buffer.isBuffer(value) ? value : Buffer.from(String(value).replace(/^\\x/, ""), "hex")),
});

export const attachments = pgTable("attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  /** Set when first sent, so a chat can list everything shared in it beyond the context window. */
  chatId: text("chat_id"),
  /** Written once by the model after upload; older turns reuse it instead of resending bytes. */
  description: text("description"),
  contentText: text("content_text"),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("attachments_user_idx").on(t.clerkUserId), index("attachments_chat_idx").on(t.clerkUserId, t.chatId)]);

/** Durable facts Cooper keeps about its user, visible and editable in Settings → Memory. */
export const memories = pgTable("memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  text: text("text").notNull(),
  category: text("category").notNull().default("other"),
  /** 1 = minor detail, 3 = core to who the user is; ranks the always-included profile. */
  importance: integer("importance").notNull().default(2),
  /** "explicit" when the user asked, "auto" when Cooper chose to remember. */
  source: text("source").notNull().default("explicit"),
  sourceChatId: text("source_chat_id"),
  /** Null until embedded; rows are backfilled on the next read. */
  embedding: vector("embedding", { dimensions: 1536 }),
  useCount: integer("use_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("memories_user_idx").on(t.clerkUserId, t.updatedAt),
  index("memories_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
]);

/** Searchable moments from past chats: finished exchanges and analyzed files. */
export const recallEntries = pgTable("recall_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  // Deleting a chat removes what Cooper can recall from it.
  chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"exchange" | "attachment">().notNull(),
  delegationId: uuid("delegation_id").references(() => delegations.id, { onDelete: "cascade" }),
  attachmentId: uuid("attachment_id").references(() => attachments.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("recall_user_idx").on(t.clerkUserId, t.createdAt),
  index("recall_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  uniqueIndex("recall_delegation_idx").on(t.delegationId),
  uniqueIndex("recall_attachment_idx").on(t.attachmentId),
]);

/** Cooper's own reminders: a push at a set time, no agent run needed to deliver one. */
export const reminders = pgTable("reminders", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  chatId: text("chat_id"),
  title: text("title").notNull(),
  body: text("body"),
  /** Opened from the notification, e.g. the Meet link of the event it is about. */
  link: text("link"),
  remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
  status: text("status").$type<"pending" | "sending" | "sent" | "cancelled" | "failed">().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("reminders_due_idx").on(t.status, t.remindAt), index("reminders_user_idx").on(t.clerkUserId, t.remindAt)]);

/** The stored inverse of an action Cooper took without asking, so the user can undo it. */
export const undoActions = pgTable("undo_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  /** The Composio session that made the change, so the undo uses the same account. */
  sessionId: text("session_id").notNull(),
  toolSlug: text("tool_slug").notNull(),
  arguments: jsonb("arguments").$type<Record<string, unknown>>().notNull(),
  status: text("status").$type<"available" | "done" | "failed">().notNull().default("available"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("undo_user_idx").on(t.clerkUserId)]);

/** AI mates the user creates; each has one ongoing chat, and can be grouped with others. */
export const mates = pgTable("mates", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("companion"),
  roleDescription: text("role_description").notNull().default(""),
  color: text("color").notNull().default("amber"),
  /** Cooper: provisioned for every user, cannot be deleted. */
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("mates_user_name_idx").on(t.clerkUserId, sql`lower(${t.name})`),
  uniqueIndex("mates_user_default_idx").on(t.clerkUserId).where(sql`${t.isDefault}`),
]);

export const groupMembers = pgTable("group_members", {
  chatId: text("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  mateId: uuid("mate_id").notNull().references(() => mates.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.chatId, t.mateId] }), index("group_members_mate_idx").on(t.mateId)]);

/** A goal a group of mates works on by itself, round after round, until the leader finishes it. */
export const missions = pgTable("missions", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  chatId: text("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  goal: text("goal").notNull(),
  status: text("status").$type<"running" | "needs_input" | "paused" | "done" | "stopped">().notNull().default("running"),
  round: integer("round").notNull().default(0),
  /** Rounds in a row that changed no notes; three trigger a check-in instead of looping. */
  idleRounds: integer("idle_rounds").notNull().default(0),
  question: text("question"),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("missions_user_idx").on(t.clerkUserId, t.updatedAt),
  // One live mission per group.
  uniqueIndex("missions_live_chat_idx").on(t.chatId).where(sql`status IN ('running','needs_input','paused')`),
]);

/** The team's shared workspace: each mate writes its part, the others build on it. */
export const missionNotes = pgTable("mission_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  missionId: uuid("mission_id").notNull().references(() => missions.id, { onDelete: "cascade" }),
  authorMateId: uuid("author_mate_id").references(() => mates.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("mission_notes_title_idx").on(t.missionId, sql`lower(${t.title})`)]);

/** A GitHub App installation the user made, giving the mates' bot access to some repos. */
export const githubInstallations = pgTable("github_installations", {
  installationId: bigint("installation_id", { mode: "number" }).primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  accountLogin: text("account_login").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("github_installations_user_idx").on(t.clerkUserId)]);

export type CodeRunStatus = "queued" | "cloning" | "coding" | "checking" | "pushing" | "done" | "failed" | "cancelled";
export type CodeCheck = { name: string; command: string; passed: boolean; output: string };
/** One line of what the computer is doing right now ("Editing src/app.ts"). */
export type CodeActivity = { at: string; text: string };

/** One job on the mates' computer: clone a repo, make a change, check it, open a pull request. */
export const codeRuns = pgTable("code_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  chatId: text("chat_id").references(() => chats.id, { onDelete: "set null" }),
  /** The chat message whose card shows this run's progress. */
  messageId: text("message_id"),
  installationId: bigint("installation_id", { mode: "number" }).notNull(),
  repo: text("repo").notNull(),
  baseBranch: text("base_branch").notNull(),
  branch: text("branch").notNull(),
  task: text("task").notNull(),
  status: text("status").$type<CodeRunStatus>().notNull().default("queued"),
  cancelRequested: boolean("cancel_requested").notNull().default(false),
  checks: jsonb("checks").$type<CodeCheck[]>().notNull().default([]),
  /** The latest activity lines, newest last; capped so the row stays small. */
  activity: jsonb("activity").$type<CodeActivity[]>().notNull().default([]),
  /** What the run spent on the coding model, read from its capped key; null until known. */
  costUsd: real("cost_usd"),
  prNumber: integer("pr_number"),
  prUrl: text("pr_url"),
  summary: text("summary"),
  sandboxId: text("sandbox_id"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("code_runs_user_idx").on(t.clerkUserId, t.createdAt),
  // Two runs pushing to one branch would race; a follow-up waits for the active run to end.
  uniqueIndex("code_runs_active_branch_idx").on(t.repo, t.branch).where(sql`status IN ('queued','cloning','coding','checking','pushing')`),
]);

/**
 * Landing-site page views. No cookies, no IPs: `visitor` is a salted daily hash, so it counts a
 * person once a day and can't be traced back to them.
 */
export const siteVisits = pgTable("site_visits", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  path: text("path").notNull(),
  referrer: text("referrer"),
  device: text("device").$type<"mobile" | "tablet" | "desktop">().notNull(),
  visitor: text("visitor").notNull(),
}, (t) => [index("site_visits_at_idx").on(t.at)]);
