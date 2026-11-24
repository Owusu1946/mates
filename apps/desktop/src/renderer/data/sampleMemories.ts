import type { Memory } from "../settings/memory.logic.ts";
import { LEAD_ID } from "./sampleCrew.ts";

/** What the sample crew remembers about Ama, until memory reaches the API (GET /v1/memories). */

const DAY = 24 * 60 * 60_000;
const ago = (days: number) => Date.now() - days * DAY;

export const SAMPLE_MEMORIES: Memory[] = [
  { id: "mem-1", text: "Lives in East Legon, works from Osu most days", category: "location", source: "bio", mateId: null, updatedAt: ago(40) },
  { id: "mem-2", text: "Prefers window seats and morning flights", category: "preference", source: "auto", mateId: null, updatedAt: ago(12) },
  { id: "mem-3", text: "Kwesi is her business partner; calls are usually Tuesdays at 2pm", category: "relationships", source: "explicit", mateId: null, updatedAt: ago(3) },
  { id: "mem-4", text: "Doesn't eat pork", category: "health", source: "explicit", mateId: null, updatedAt: ago(30) },
  { id: "mem-5", text: "Sister Efua's birthday is 14 March", category: "relationships", source: "auto", mateId: null, updatedAt: ago(20) },
  { id: "mem-6", text: "Wants replies short, without bullet points", category: "preference", source: "auto", mateId: null, updatedAt: ago(1) },
  { id: "mem-7", text: "Planning a waakye shop in Kumasi for next year", category: "goals", source: "briefing", mateId: LEAD_ID, updatedAt: ago(6) },
  { id: "mem-8", text: "Monthly budget is GH¢6,000; rent is GH¢2,500", category: "finance", source: "explicit", mateId: "akua", updatedAt: ago(9) },
  { id: "mem-9", text: "Pays DStv and ECG on the 1st; asks before any payment", category: "finance", source: "auto", mateId: "akua", updatedAt: ago(2) },
  { id: "mem-10", text: "Likes sources linked, and prices in cedis", category: "preference", source: "auto", mateId: "esi", updatedAt: ago(15) },
  { id: "mem-11", text: "Works mostly in the muse-clone repo; uses pnpm", category: "projects", source: "import:chatgpt", mateId: "yaw", updatedAt: ago(25) },
];
