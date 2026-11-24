/**
 * What your mates remember, as the phone's Memory screen has it (apps/mobile/app/(app)/memory.tsx)
 * and the API stores it (apps/api/src/memory.ts): shared memories, each mate's own notes, search,
 * editing within the API's 500 characters, and export as text.
 */

/** `mateId` null: shared by every mate; set: that mate's own note for its role. */
export type Memory = { id: string; text: string; category: string; source: string; mateId: string | null; updatedAt: number };

/** The API's limit on one memory (MAX_MEMORY_CHARS). */
export const MAX_MEMORY_CHARS = 500;

const SOURCE_LABEL: Record<string, string> = { auto: "Saved automatically", bio: "From what you shared", briefing: "From a briefing", explicit: "You asked" };
const IMPORTED_FROM: Record<string, string> = { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini", grok: "Grok" };

/** Where a memory came from, in words: "You asked", or "Imported from ChatGPT". */
export function sourceLabel(source: string): string {
  if (source.startsWith("import:")) return `Imported from ${IMPORTED_FROM[source.slice(7)] ?? "another assistant"}`;
  return SOURCE_LABEL[source] ?? "Saved";
}

/** The memories whose text or category has every word you typed, any case. */
export function searchMemories(memories: Memory[], query: string): Memory[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return memories;
  return memories.filter((memory) => {
    const haystack = `${memory.text} ${memory.category}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export type MemorySection = { mateId: string | null; rows: Memory[] };

/**
 * Shared first, then each mate's own notes in crew order, newest first within each. A note from a
 * mate that isn't in the crew shows as shared, as on the phone. Empty sections are left out.
 */
export function groupMemories(memories: Memory[], mateIds: string[]): MemorySection[] {
  const known = new Set(mateIds);
  const newest = (rows: Memory[]) => [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
  return [
    { mateId: null, rows: newest(memories.filter((memory) => !memory.mateId || !known.has(memory.mateId))) },
    ...mateIds.map((mateId) => ({ mateId, rows: newest(memories.filter((memory) => memory.mateId === mateId)) })),
  ].filter((section) => section.rows.length > 0);
}

/** The text to save, or null when it's empty or too long. */
export function cleanMemoryText(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_MEMORY_CHARS ? trimmed : null;
}

/** Everything as plain text, one section per heading, and a dated file name. */
export function exportMemories(memories: Memory[], mates: { id: string; name: string }[], now: number): { text: string; filename: string } {
  const sections = groupMemories(memories, mates.map((mate) => mate.id));
  const heading = (mateId: string | null) => (mateId ? `${mates.find((mate) => mate.id === mateId)?.name}'s notes` : "Shared with every mate");
  const text = sections.map((section) => [`# ${heading(section.mateId)}`, ...section.rows.map((memory) => `- ${memory.text}`)].join("\n")).join("\n\n");
  const date = new Date(now);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { text: `What my mates remember\n\n${text}\n`, filename: `mates-memories-${day}.txt` };
}
