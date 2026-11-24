import type { ShapeName } from "@muse-clone/mascot";
import type { ActivityStatus, FriendGrants } from "../places/places.logic.ts";
import type { MateColor } from "../theme/matePalette.ts";
import { LEAD_ID } from "./sampleCrew.ts";

/**
 * What mates did, routines and friends for the sample workspace, until these pages reach the API.
 * Times are relative to when the app opened, so the feed always looks current.
 */

const opened = Date.now();
const ago = (minutes: number) => opened - minutes * 60_000;

export type ActivityItem = { id: string; mateId: string; chatId: string; title: string; status: ActivityStatus; at: number; result?: string };

export const ACTIVITY: ActivityItem[] = [
  { id: "a1", mateId: "abena", chatId: "chat-abena", title: "Finding a dentist slot for Thursday", status: "working", at: ago(4) },
  { id: "a2", mateId: "akua", chatId: "chat-lead", title: "Pay DStv Compact, GH¢295", status: "needsYou", at: ago(38), result: "Waiting for your OK in Kofi's chat. It's a payment, so it won't go without you." },
  { id: "a3", mateId: "esi", chatId: "chat-esi", title: "Found 3 hostels near KNUST", status: "done", at: ago(95), result: "Bomso Heights (GH¢3,600, 4 min walk), Ayeduase Lodge (GH¢3,200, shuttle) and Kotei Court (GH¢3,900, new), in a page with photos and reviews." },
  { id: "a4", mateId: LEAD_ID, chatId: "chat-lead", title: "Your morning brief", status: "done", at: ago(180), result: "Calendar, email, the light schedule, your commute and bills, in one card." },
  { id: "a5", mateId: "yaw", chatId: "chat-yaw", title: "Shipped dark mode in muse-clone", status: "done", at: ago(60 * 20), result: "PR #142 is up and all checks pass." },
  { id: "a6", mateId: "akua", chatId: "chat-akua", title: "November packaging spend", status: "done", at: ago(60 * 22), result: "GH¢1,840, under your GH¢2,000 limit." },
  { id: "a7", mateId: LEAD_ID, chatId: "chat-lead", title: "Book a table at Santoku for Saturday", status: "failed", at: ago(60 * 46), result: "Their booking page was down. I'll try again tonight, or I can call them." },
];

export type RoutineRun = { at: number; status: "done" | "needsYou" | "failed"; summary: string };
export type Routine = { id: string; name: string; task: string; mateId: string; days: number[]; time: string; on: boolean; drafted?: boolean; runs: RoutineRun[] };

export const ROUTINES: Routine[] = [
  {
    id: "r1",
    name: "Morning brief",
    task: "Brief me on my day: calendar, emails that need me, the light schedule, my commute and bills due.",
    mateId: LEAD_ID,
    days: [0, 1, 2, 3, 4, 5, 6],
    time: "7:00",
    on: true,
    runs: [
      { at: ago(180), status: "done", summary: "5 things today, one bill due Friday." },
      { at: ago(60 * 27), status: "done", summary: "Quiet day: two meetings, no bills." },
    ],
  },
  {
    id: "r2",
    name: "Light-off alert",
    task: "Check ECG's schedule for East Legon and tell me if the lights go off today, and when.",
    mateId: LEAD_ID,
    days: [0, 1, 2, 3, 4, 5, 6],
    time: "6:00",
    on: true,
    runs: [{ at: ago(240), status: "done", summary: "Off 6–10pm tonight." }],
  },
  {
    id: "r3",
    name: "Friday money check",
    task: "Total what I spent this week, by category, and flag anything over budget.",
    mateId: "akua",
    days: [5],
    time: "17:00",
    on: true,
    runs: [{ at: ago(60 * 24 * 4), status: "done", summary: "GH¢2,310 this week; food is over by GH¢140." }],
  },
  {
    id: "r4",
    name: "Hostel prices",
    task: "Check the three KNUST hostels I saved and tell me if any price drops.",
    mateId: "esi",
    days: [1],
    time: "9:00",
    on: false,
    drafted: true,
    runs: [],
  },
];

export type FriendNote = { at: number; kind: "shared" | "answered" | "waiting"; text: string };
export type Friend = { id: string; name: string; email: string; nickname: string; mate: { name: string; shape: ShapeName; color: MateColor }; grants: FriendGrants; notes: FriendNote[] };

export const FRIENDS: Friend[] = [
  {
    id: "f1",
    name: "Efua Mensah",
    email: "efua@mail.com",
    nickname: "Efua",
    mate: { name: "Nana", shape: "squircle", color: "rose" },
    grants: { freeTime: true, updates: true, answers: false },
    notes: [
      { at: ago(60 * 3), kind: "shared", text: "Ama is free Thursday after 4pm." },
      { at: ago(60 * 2), kind: "answered", text: "Yes, book the 7pm showing at Silverbird." },
    ],
  },
  {
    id: "f2",
    name: "Kojo Asante",
    email: "kojo@mail.com",
    nickname: "Uncle Kojo",
    mate: { name: "Kweku", shape: "pebble", color: "blue" },
    grants: { freeTime: false, updates: false, answers: false },
    notes: [{ at: ago(30), kind: "waiting", text: "Kweku asked when you can come for Sunday lunch." }],
  },
];

export const FRIEND_REQUESTS = [{ id: "q1", name: "Abena Owusu", email: "abena.o@mail.com", mateName: "Kwame" }];

/** For the sample invite: who has already been asked, and who's on Mates. */
export const ASKED = ["nana.k@mail.com"];
export const ON_MATES = ["adjoa@mail.com", "yaw.b@mail.com"];
