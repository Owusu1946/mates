import type { SentFile } from "../chat/attachments.logic.ts";
import type { ShapeName } from "@muse-clone/mascot";
import type { MateColor } from "../theme/matePalette.ts";

/**
 * A sample crew, so the window can be judged full of life before the API is wired up. The lead
 * mate from onboarding replaces Kofi (see `crewFor`). Nothing here leaves the device.
 */

export type MateStatus = "idle" | "listening" | "thinking" | "working" | "happy" | "waiting";

export type Mate = {
  id: string;
  name: string;
  role: string;
  color: MateColor;
  shape: ShapeName;
  status: MateStatus;
  /** What it's doing right now, shown on hover while it works. */
  step?: string;
};

export type BriefRow = { label: string; text: string };

/** How an answer to a card stands on this device: on its way, or it couldn't go (chat/cards/cardAnswers.logic.ts). */
export type CardStatus = { pending: string } | { error: string };

/** A card that can be answered: the run waiting for the answer (resumed with it, apps/api durable-runs). */
type Resumable = { resumeRunId?: string };

/** A mate as a card names it, in its own look: it may not be in your crew list yet (a mate just made, a friend's). */
export type CardMate = { id: string; name: string; gradient: [string, string, string]; shape?: string };
export type HandoffStatus = "queued" | "working" | "review" | "changes" | "done" | "waiting" | "failed";
export type DeckStatus = "queued" | "outlining" | "writing" | "ready" | "editing" | "failed" | "cancelled";

export type Card =
  | { type: "brief"; title: string; rows: BriefRow[] }
  /** What a reply is doing, and did: its steps (searching the web, reading pages), and how long it took. */
  | { type: "handoff"; from: CardMate; asked: boolean; round?: number; items: { mate: CardMate; task: string; status: HandoffStatus; step?: string }[] }
  | { type: "deck"; deckId: string; title: string; status: DeckStatus; built: number; total: number; slides: { id: string; title: string }[]; error?: string }
  | { type: "newMate"; mate: CardMate & { role: string; description: string; chatId: string } }
  | { type: "consult"; mate: CardMate; question: string; found: number }
  | { type: "activity"; label: string; steps: { label: string; done: boolean; app?: string }[]; startedAt?: string; finishedAt?: string; state: "running" | "done" | "stopped" | "error" }
  /** `always`: the API offers Always allow (never for money); `fields`/`targets`: what it will send, and to whom. */
  | ({ type: "approval"; title: string; detail: string; meta: string; allow: string; state: "open" | "allowed" | "skipped"; canAlways?: boolean; fields?: BriefRow[]; targets?: string[] } & Resumable)
  /** Pick one: which account, which app. */
  | ({ type: "choice"; title: string; detail?: string; options: { id: string; label: string; detail?: string; app?: string }[]; state: "open" | "done" } & Resumable)
  /** Everything else a mate shows (a deck, a computer task, a call): what it is and how it stands. */
  | { type: "summary"; icon: "monitor" | "globe" | "phone" | "file" | "users" | "brain" | "clock" | "info"; title: string; detail?: string; state: "running" | "done" | "waiting" | "error"; onPhone?: boolean }
  /** Code a mate did for you, as a job like any other: what changed, and a way in to see the work. */
  | { type: "run"; runId: string; title: string; project: string; files: number; pr?: number }
  // The rest follow the API's WorkflowCard (apps/api/src/integrations.ts), trimmed to what they show.
  /** The pages an answer drew on. */
  | { type: "sources"; sources: Source[] }
  /** A memory a mate saved, changed or forgot mid-chat. */
  | { type: "memory"; id?: string; text: string; action: "saved" | "updated" | "forgotten"; undone?: boolean }
  /** What a mate found in an app, like the emails that need you. */
  | { type: "results"; app: CardApp; title: string; items: ResultItem[]; followUps?: { label: string; prompt: string }[] }
  /** What a mate is about to do, for one OK, or has done. */
  | ({ type: "plan"; title: string; state: "review" | "running" | "done" | "declined"; actions: PlanAction[] } & Resumable)
  /** The lead's call after several mates answered the same question. */
  | { type: "comparison"; suggestion: string; perMate: { mateId: string; recommendation: string; basis: string }[]; disagreements: string[] }
  /** A routine set up in chat. */
  | { type: "schedule"; routineId?: string; version?: number; title: string; when: string; next: string; status: "active" | "paused" | "cancelled" }
  /** "Watch for X, then do Y". */
  | { type: "watch"; watchId?: string; version?: number; title: string; condition: string; action: string; every: string | null; app: string | null; lastNote: string | null; lastChecked: string | null; status: "active" | "paused" | "fired" | "cancelled" | "expired" | "failed" }
  /** An app a mate needs before it can carry on. */
  | ({ type: "connect"; app: CardApp; reason: string; state: "needed" | "connecting" | "connected" } & Resumable);

export type CardApp = { slug: string; name: string };
export type Source = { id: string; url: string; title: string; domain: string; published?: string; favicon?: string };
export type ResultItem = { id: string; from: string; title: string; snippet: string; time: string; unread?: boolean; url?: string };
export type PlanAction = { id: string; app: CardApp; label: string; detail?: string; selected: boolean; status?: "done" | "skipped" | "running" | "failed"; error?: string; undo?: { kind: "app" | "reminder"; id: string } };

/** Something @-mentioned with a message, kept as it was named then. */
export type MessageTag = { kind: "web" | "chief" | "mate" | "app"; id: string; label: string };

/** Enough of a message to show it quoted, even after it changes. */
export type Quote = { id: string; author: string; text: string };

export type Message = {
  id: string;
  /** "me", or the id of the mate who wrote it. */
  author: string;
  text: string;
  card?: Card;
  /** A mate's reply: its cards in order (what it's doing, what it needs, what it found). */
  cards?: Card[];
  /** Answers to its cards in flight here, by the card's place in the reply. */
  cardStatuses?: Record<number, CardStatus>;
  /** Files you sent with it. */
  files?: SentFile[];
  /** In a group, the message you were answering, as it read then. */
  replyTo?: Quote;
  /** Kept in the chat's pinned list. */
  pinned?: boolean;
  /** Your thumbs on a mate's reply. */
  rating?: "up" | "down";
  /** A mate's reply asked again: every version, with `text` the one showing (at `version`). */
  versions?: string[];
  version?: number;
  /** Yours, when it didn't go: it can be sent again. */
  failed?: boolean;
  /** Why it didn't go, in the API's words (out of usage, offline). */
  failedReason?: string;
  /** Yours, changed after sending. */
  edited?: boolean;
  /** What you @-mentioned with it: web search, Chief of Staff, mates, an app. */
  tags?: MessageTag[];
  /** Shown as a divider above the message. */
  day?: string;
  /** The stored message this row shows (one stored reply can be several rows in a group). */
  sourceId?: string;
  /** The server is still writing it: here, on another device, or in a routine. */
  live?: boolean;
  /** What the mate is doing right now, while a live reply works (its running step). */
  step?: string;
  /** The versions' stored ids, matching `versions`, for switching between them. */
  versionIds?: string[];
};

export type Chat = {
  id: string;
  kind: "mate" | "group" | "thread";
  title: string;
  mateIds: string[];
  /** The mate this chat is with, or the group's lead. */
  leadId: string;
  /** The line under the name in the sidebar. */
  preview: string;
  time: string;
  unread?: boolean;
};

export type Repo = { id: string; name: string; where: "this PC" | "cloud" };

export const REPOS: Repo[] = [
  { id: "muse-clone", name: "muse-clone", where: "this PC" },
  { id: "finora", name: "finora", where: "cloud" },
];

export const LEAD_ID = "lead";

const MATES: Mate[] = [
  { id: LEAD_ID, name: "Kofi", role: "Lead mate", color: "amber", shape: "hexagon", status: "idle" },
  { id: "esi", name: "Esi", role: "Research", color: "teal", shape: "circle", status: "idle" },
  { id: "abena", name: "Abena", role: "Planning", color: "purple", shape: "squircle", status: "working", step: "Finding a dentist slot for Thursday" },
  { id: "yaw", name: "Yaw", role: "Builder", color: "blue", shape: "pebble", status: "idle" },
  { id: "akua", name: "Akua", role: "Money", color: "green", shape: "cloud", status: "waiting", step: "Waiting on your OK for the DStv payment" },
];

const CHATS: Chat[] = [
  { id: "chat-lead", kind: "mate", title: "Kofi", mateIds: [LEAD_ID], leadId: LEAD_ID, preview: "Good morning, Ama", time: "7:02" },
  { id: "chat-esi", kind: "mate", title: "Esi", mateIds: ["esi"], leadId: "esi", preview: "Found 3 hostels under GH¢4,000", time: "9:14", unread: true },
  { id: "chat-abena", kind: "mate", title: "Abena", mateIds: ["abena"], leadId: "abena", preview: "Looking at Thursday…", time: "9:40" },
  { id: "chat-yaw", kind: "mate", title: "Yaw", mateIds: ["yaw"], leadId: "yaw", preview: "PR #142 is up", time: "Mon" },
  { id: "chat-akua", kind: "mate", title: "Akua", mateIds: ["akua"], leadId: "akua", preview: "Needs your OK", time: "Sun" },
  { id: "group-shop", kind: "group", title: "Shop team", mateIds: [LEAD_ID, "akua", "esi"], leadId: LEAD_ID, preview: "Akua: Kumasi saves about GH¢400", time: "Tue" },
  { id: "group-waakye", kind: "group", title: "Waakye HQ", mateIds: [LEAD_ID, "esi", "akua", "yaw"], leadId: LEAD_ID, preview: "Research and costs are in", time: "Wed" },
];

function messagesFor(you: string): Record<string, Message[]> {
  return {
    "chat-lead": [
      {
        id: "m1",
        author: LEAD_ID,
        day: "Today",
        text: "",
        card: {
          type: "brief",
          title: `Good morning, ${you}`,
          rows: [
            { label: "Calendar", text: "2pm Kwesi (supplier call) · 5pm gym" },
            { label: "Email", text: "3 need you, including an invoice from Kente Prints" },
            { label: "Light", text: "Off in East Legon 6–10pm. Charge the laptop." },
            { label: "Commute", text: "Leave at 8:10. Bolt GH¢38, Yango GH¢41" },
            { label: "Bills", text: "DStv Compact due Friday" },
          ],
        },
      },
      { id: "m2", author: "me", text: "Move the Kwesi call to Thursday, same time, and pay the DStv." },
      { id: "m3", author: LEAD_ID, text: `Done: Kwesi's call is now Thursday at 2pm, and he's been told. The DStv needs your OK because it's a payment.` },
      {
        id: "m4",
        author: LEAD_ID,
        text: "",
        card: { type: "approval", title: "Pay GH¢295 to DStv?", detail: "Compact bouquet, smartcard 7023 ••• 118, for December. You'll approve it with your MoMo PIN.", meta: "MTN MoMo · 024 ••• 4417", allow: "Send the prompt", state: "open" },
      },
      { id: "m5", author: "me", text: "Every Friday at 4, remind me to send the week's invoices." },
      {
        id: "m6",
        author: LEAD_ID,
        text: "Set. I'll remind you every Friday at 4pm, with the invoices you haven't sent.",
        card: { type: "schedule", title: "Send the week's invoices", when: "Fridays at 4:00 pm", next: "Friday 4:00 pm", status: "active" },
      },
      { id: "m7", author: LEAD_ID, text: "", card: { type: "memory", text: "Sends invoices every Friday afternoon", action: "saved" } },
      { id: "m8", author: "me", text: "Which emails need me?" },
      {
        id: "m9",
        author: LEAD_ID,
        text: "These three. The Kente Prints invoice is due Monday.",
        card: {
          type: "results",
          app: { slug: "gmail", name: "Gmail" },
          title: "3 need you",
          items: [
            { id: "g1", from: "Kente Prints", title: "Invoice #2291", snippet: "GH¢1,240 for the November labels, due Monday", time: "9:12", unread: true },
            { id: "g2", from: "Kwesi Mensah", title: "Re: Thursday call", snippet: "Thursday works. Can we start at 2:30?", time: "8:40", unread: true },
            { id: "g3", from: "ECG", title: "Your prepaid units are low", snippet: "About 18 units left at your usual use", time: "Yesterday" },
          ],
        },
      },
      { id: "m10", author: "me", text: "Move the gym to 6." },
      {
        id: "m11",
        author: LEAD_ID,
        text: "I need your calendar for that.",
        card: { type: "connect", app: { slug: "googlecalendar", name: "Google Calendar" }, reason: "To move events and keep your days in step", state: "needed" },
      },
    ],
    "chat-esi": [
      { id: "e1", author: "me", day: "Today", text: "Find me hostels near KNUST under GH¢4,000 a year." },
      {
        id: "e2",
        author: "esi",
        text: "Found 3 that fit: Bomso Heights (GH¢3,600, 4 min walk), Ayeduase Lodge (GH¢3,200, shuttle) and Kotei Court (GH¢3,900, new).",
        card: {
          type: "sources",
          sources: [
            { id: "src1", url: "https://www.knust.edu.gh/students/accommodation", title: "Private hostels near campus: approved list", domain: "knust.edu.gh", published: "Aug 2026" },
            { id: "src2", url: "https://meqasa.com", title: "Bomso Heights hostel, 2-in-a-room, GH¢3,600 a year", domain: "meqasa.com", published: "3 days ago" },
            { id: "src3", url: "https://tonaton.com", title: "Ayeduase Lodge with free shuttle to campus", domain: "tonaton.com", published: "1 week ago" },
            { id: "src4", url: "https://meqasa.com", title: "Kotei Court: new hostel, rooms from GH¢3,900", domain: "meqasa.com", published: "2 weeks ago" },
          ],
        },
      },
    ],
    "chat-abena": [
      { id: "a1", author: "me", day: "Today", text: "Book a dentist for Thursday morning, near East Legon." },
      {
        id: "a3",
        author: "abena",
        text: "East Legon Dental has 10:30 on Thursday. Here's what I'll do. Untick anything you'd rather not.",
        card: {
          type: "plan",
          title: "Dentist on Thursday",
          state: "review",
          actions: [
            { id: "p1", app: { slug: "googlecalendar", name: "Google Calendar" }, label: "Check Thursday morning is free", selected: true },
            { id: "p2", app: { slug: "eastlegondental", name: "East Legon Dental" }, label: "Book 10:30", detail: "check-up and clean", selected: true },
            { id: "p3", app: { slug: "googlecalendar", name: "Google Calendar" }, label: "Add it to your calendar", selected: true },
            { id: "p4", app: { slug: "gmail", name: "Gmail" }, label: "Tell Kwesi you'll join at 2:30", selected: false },
          ],
        },
      },
      { id: "a2", author: "me", text: "Anywhere with parking is fine.", failed: true },
    ],
    "chat-yaw": [
      { id: "y1", author: "me", day: "Monday", text: "Ship dark mode in muse-clone." },
      {
        id: "y2",
        author: "yaw",
        text: "Done: PR #142 is up. The theme follows the system, Settings has Light / Dark / System, and all checks pass.",
        card: { type: "run", runId: "run-dark", title: "Ship dark mode", project: "muse-clone", files: 2, pr: 142 },
      },
    ],
    "chat-akua": [
      { id: "k1", author: "akua", day: "Sunday", text: "Packaging came to GH¢1,840 this month. That leaves GH¢160 in the budget." },
      { id: "k2", author: "me", text: "Tell me when a Bolt to the airport drops under GH¢60." },
      {
        id: "k3",
        author: "akua",
        text: "I'll keep an eye on it.",
        card: {
          type: "watch",
          title: "Bolt to Kotoka under GH¢60",
          condition: "A Bolt from East Legon to the airport costs less than GH¢60",
          action: "Tell you, with the price and a link to book",
          every: "every 2 hours",
          app: null,
          lastNote: "GH¢72, still above",
          lastChecked: "1 h ago",
          status: "active",
        },
      },
    ],
    "group-shop": [
      { id: "s1", author: "me", day: "Tuesday", text: "Order the 2,000 boxes from Ofori again, or try the Kumasi supplier?" },
      { id: "s2", author: "akua", text: "Kumasi is GH¢3.60 a box plus about GH¢600 transport, so about GH¢400 cheaper for 2,000." },
      { id: "s3", author: "esi", text: "Kumasi has 11 reviews and two mention late December deliveries. Ofori has been on time 6 times running." },
      { id: "s4", author: LEAD_ID, text: `I'd split it: 1,500 from Ofori, 500 from Kumasi. Safe for December, and a real test of Kumasi. Want me to ask both, ${you}?`, pinned: true },
    ],
    "group-waakye": [
      { id: "w1", author: "me", day: "Today", text: "What would it take to start delivering waakye in East Legon?" },
      { id: "w2", author: "akua", text: "You'll need about GH¢2,750 to open and 38 orders a day to break even." },
      {
        id: "w3",
        author: LEAD_ID,
        text: "",
        card: {
          type: "comparison",
          suggestion: `Start with weekday lunch orders, ${you}. It keeps the menu small and the costs low while you find out who orders again.`,
          perMate: [
            { mateId: "akua", recommendation: "GH¢2,750 to open; break even at 38 orders a day.", basis: "Rent share, a cook, packaging and Bolt Food's 20% cut" },
            { mateId: "esi", recommendation: "Lunch is the gap: two of the three nearby spots only open at night.", basis: "Reviews and opening hours within 2 km of A&C Mall" },
            { mateId: "yaw", recommendation: "A WhatsApp order flow is enough to start; an app can wait.", basis: "Fastest to set up, and customers already use it" },
          ],
          disagreements: ["Akua would add breakfast from month two; Esi says lunch alone until orders repeat."],
        },
      },
    ],
  };
}

/** What you "say" to each mate when holding to talk, until speech is transcribed for real. */
export const VOICE_LINES: Record<string, string> = {
  [LEAD_ID]: "Move my supplier call to Thursday afternoon and remind me an hour before",
  esi: "Find me hostels near KNUST under four thousand cedis a year",
  abena: "Book a dentist for Thursday morning somewhere near East Legon",
  yaw: "Fix the sign-in sheet on iOS and open a pull request",
  akua: "How much have I spent on packaging this month",
};

/** Each mate's canned replies, in order, for sending without an API. */
export const REPLIES: Record<string, string[]> = {
  [LEAD_ID]: ["On it. I'll let you know when it's done.", "Done. Anything else for today?", "Good idea. I've added it to your list for tomorrow morning."],
  esi: ["I'll check reviews and compare prices.", "Bomso Heights is closest. Ayeduase Lodge costs GH¢400 less and has a shuttle."],
  abena: ["I'll find a time that works and check your calendar first.", "Thursday 10:30 is free at East Legon Dental. Shall I book it?"],
  yaw: ["Pick a repository under Code when you're ready to start a run.", "You can open a run under Code to see its changes."],
  akua: ["Let me check your spending first.", "You've spent GH¢1,840 on packaging this month, under your limit."],
};

export type SampleProfile = { bio: string; memories: string[] };

export type Crew = {
  you: string;
  mates: Mate[];
  chats: Chat[];
  messages: Record<string, Message[]>;
  profile?: SampleProfile;
  /** Whether this workspace has projects connected (the sample does; someone new doesn't yet). */
  hasProjects?: boolean;
};

/** The sample crew, led by the mate made in onboarding when there is one. */
export function crewFor(you: string, lead?: { name: string; color: MateColor; shape: ShapeName }): Crew {
  const leadName = lead?.name ?? "Kofi";
  const mates = MATES.map((mate) => (mate.id === LEAD_ID && lead ? { ...mate, name: lead.name, color: lead.color, shape: lead.shape } : mate));
  const chats = CHATS.map((chat) => (chat.id === "chat-lead" ? { ...chat, title: leadName, preview: `Good morning, ${you}` } : chat));
  return { you, mates, chats, messages: messagesFor(you) };
}
