import { useSyncExternalStore } from "react";
import { SAMPLE_MEMORIES } from "../data/sampleMemories.ts";
import type { SampleProfile } from "../data/sampleCrew.ts";
import type { Memory } from "./memory.logic.ts";

/**
 * The memories for this session, the way the phone's Memory screen changes them through the API
 * (PATCH /v1/memories/:id, DELETE /v1/memories/:id, DELETE /v1/memories).
 */

let memories = SAMPLE_MEMORIES;
let seeded = false;
const listeners = new Set<() => void>();

function commit(next: Memory[]) {
  memories = next;
  for (const listener of listeners) listener();
}

/** Adds what you imported in onboarding, once, before anything reads the list. */
export function seedFromProfile(profile: SampleProfile | undefined) {
  if (seeded || !profile) return;
  seeded = true;
  const now = Date.now();
  memories = [...profile.memories.map((text, index) => ({ id: `onboarding-${index}`, text, category: "other", source: "import:chatgpt", mateId: null, updatedAt: now })), ...memories];
}

export const editMemory = (id: string, text: string) => commit(memories.map((memory) => (memory.id === id ? { ...memory, text, updatedAt: Date.now() } : memory)));
export const shareMemory = (id: string) => commit(memories.map((memory) => (memory.id === id ? { ...memory, mateId: null } : memory)));
export const forgetMemory = (id: string) => commit(memories.filter((memory) => memory.id !== id));
export const restoreMemory = (memory: Memory) => commit([...memories, memory]);
export const forgetAllMemories = () => commit([]);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useMemories() {
  return useSyncExternalStore(subscribe, () => memories);
}
