import type { ShapeName } from "@muse-clone/mascot";
import type { MateColor } from "../theme/matePalette.ts";

/**
 * A sample crew, so the window can be judged full of life before the API is wired up. The lead
 * mate from onboarding replaces Kofi (see `crewFor`). Nothing here leaves the device.
 */

export type MateStatus = "idle" | "thinking" | "working" | "waiting";

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

export type BriefRow = { label: string; text: string; action?: string };

export type Card =
  | { type: "brief"; title: string; rows: BriefRow[] }
  | { type: "approval"; title: string; detail: string; meta: string; allow: string; state: "open" | "allowed" | "skipped" }
  | { type: "mission"; goal: string; working: string; done: number; total: number };

export type Message = {
  id: string;
  /** "me", or the id of the mate who wrote it. */
  author: string;
  text: string;
  card?: Card;
  /** Shown as a divider above the message. */
  day?: string;
};

export type Chat = {
  id: string;
  kind: "mate" | "group";
  title: string;
  mateIds: string[];
  /** The mate this chat is with, or the group's lead. */
  leadId: string;
  /** The line under the name in the sidebar. */
  preview: string;
  time: string;
  unread?: boolean;
};

export type Place = { id: "activity" | "routines" | "friends"; label: string; icon: "activity" | "clock" | "users"; badge?: string };
export type Repo = { id: string; name: string; where: "this PC" | "cloud" };

export const PLACES: Place[] = [
  { id: "activity", label: "What mates did", icon: "activity" },
  { id: "routines", label: "Routines", icon: "clock", badge: "2" },
  { id: "friends", label: "Friends", icon: "users" },
];

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
  { id: "group-waakye", kind: "group", title: "Waakye HQ", mateIds: [LEAD_ID, "esi", "akua", "yaw"], leadId: LEAD_ID, preview: "Nana and Efua working", time: "now" },
];

function messagesFor(you: string, lead: string): Record<string, Message[]> {
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
            { label: "Email", text: "3 need you, 1 is an invoice from Kente Prints", action: "Open" },
            { label: "Light", text: "Off in East Legon 6–10pm. Charge the laptop." },
            { label: "Commute", text: "Leave 8:10. Bolt GH¢38, Yango GH¢41", action: "Book Bolt" },
            { label: "Bills", text: "DStv Compact due Friday", action: "Pay" },
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
    ],
    "chat-esi": [
      { id: "e1", author: "me", day: "Today", text: "Find me hostels near KNUST under GH¢4,000 a year." },
      { id: "e2", author: "esi", text: "Found 3 that fit: Bomso Heights (GH¢3,600, 4 min walk), Ayeduase Lodge (GH¢3,200, shuttle) and Kotei Court (GH¢3,900, new). I put them in a page with photos and what people say." },
    ],
    "chat-abena": [{ id: "a1", author: "me", day: "Today", text: "Book a dentist for Thursday morning, near East Legon." }],
    "chat-yaw": [
      { id: "y1", author: "me", day: "Monday", text: "Ship dark mode in muse-clone." },
      { id: "y2", author: "yaw", text: "Done: PR #142 is up. The theme follows the system, Settings has Light / Dark / System, and all checks pass." },
    ],
    "chat-akua": [{ id: "k1", author: "akua", day: "Sunday", text: "Packaging came to GH¢1,840 this month, under your GH¢2,000 limit. The DStv payment is waiting on your OK in Kofi's chat." }],
    "group-shop": [
      { id: "s1", author: "me", day: "Tuesday", text: "Order the 2,000 boxes from Ofori again, or try the Kumasi supplier?" },
      { id: "s2", author: "akua", text: "Kumasi is GH¢3.60 a box plus about GH¢600 transport, so about GH¢400 cheaper for 2,000." },
      { id: "s3", author: "esi", text: "Kumasi has 11 reviews and two mention late December deliveries. Ofori has been on time 6 times running." },
      { id: "s4", author: LEAD_ID, text: `I'd split it: 1,500 from Ofori, 500 from Kumasi. Safe for December, and a real test of Kumasi. Want me to ask both, ${you}?` },
    ],
    "group-waakye": [
      { id: "w1", author: LEAD_ID, day: "Today", text: "", card: { type: "mission", goal: "Launch a waakye delivery business in East Legon", working: "Nana and Efua working", done: 3, total: 9 } },
      { id: "w2", author: "akua", text: "Financial model is in the notes. To open: GH¢2,750. Break-even is 38 orders a day." },
      { id: "w3", author: LEAD_ID, text: `Research and numbers are in, ${lead === "Kofi" ? "Ama" : you}. Round 4: brand work starts.` },
    ],
  };
}

/** Each mate's canned replies, in order, for sending without an API. */
export const REPLIES: Record<string, string[]> = {
  [LEAD_ID]: ["On it. I'll let you know when it's done.", "Done. Anything else for today?", "Good idea. I've added it to your list for tomorrow morning."],
  esi: ["Looking into it now. I'll check reviews and prices, with sources.", "Here's what I found: two good options, and one to avoid. Want a page with the details?"],
  abena: ["I'll find a time that works and check your calendar first.", "Thursday 10:30 is free at East Legon Dental. Shall I book it?"],
  yaw: ["I'll start a run on this computer and open a PR when the checks pass.", "Working on it in a new branch. You can watch it in Code."],
  akua: ["Let me check your spending first.", "You've spent GH¢1,840 on packaging this month, under your limit."],
};

export type Crew = { you: string; mates: Mate[]; chats: Chat[]; messages: Record<string, Message[]> };

/** The sample crew, led by the mate made in onboarding when there is one. */
export function crewFor(you: string, lead?: { name: string; color: MateColor; shape: ShapeName }): Crew {
  const leadName = lead?.name ?? "Kofi";
  const mates = MATES.map((mate) => (mate.id === LEAD_ID && lead ? { ...mate, name: lead.name, color: lead.color, shape: lead.shape } : mate));
  const chats = CHATS.map((chat) => (chat.id === "chat-lead" ? { ...chat, title: leadName, preview: `Good morning, ${you}` } : chat));
  return { you, mates, chats, messages: messagesFor(you, leadName) };
}
