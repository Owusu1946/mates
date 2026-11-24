/**
 * The lead mate's name and look, as on the phone (apps/mobile/src/onboarding/leader-setup.tsx):
 * today's Akan day name to start, a shuffle for the other six, or the person's own.
 */

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** Sunday first (apps/api/src/mates.ts DAY_NAMES). */
export const DAY_NAMES = ["Kwesi", "Kojo", "Kwabena", "Kweku", "Yaw", "Kofi", "Kwame"] as const;

/** The same rule the app and API use (apps/mobile/src/mates/mate-form.tsx). */
const NAME_PATTERN = /^[\p{L}\p{N} .'_-]+$/u;
export const MAX_NAME = 24;

export const dayNameFor = (date: Date) => DAY_NAMES[date.getDay()]!;

/** The next day name after the current one, or after today's when the name is their own. */
export function nextDayName(current: string, today: number): string {
  const index = dayIndexOf(current);
  return DAY_NAMES[((index < 0 ? today : index) + 1) % 7]!;
}

export function dayIndexOf(name: string): number {
  const trimmed = name.trim().toLowerCase();
  return DAY_NAMES.findIndex((day) => day.toLowerCase() === trimmed);
}

/** The line under the name: the day it's from, the person's own name, or what's wrong with it. */
export function nameHint(name: string): { text: string; problem: boolean } {
  const trimmed = name.trim();
  if (trimmed && !NAME_PATTERN.test(trimmed)) return { text: "Use letters, numbers and spaces only.", problem: true };
  const day = dayIndexOf(trimmed);
  return { text: day >= 0 ? `Born on a ${WEEKDAYS[day]}` : "Your own name", problem: false };
}

export const isValidName = (name: string) => name.trim().length > 0 && !nameHint(name).problem;
