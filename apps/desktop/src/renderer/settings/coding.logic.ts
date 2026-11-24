/**
 * Mates is a personal assistant; coding and building websites are things it can also do. So the
 * coding tools (Projects in the sidebar, runs, the Diff panel and terminal) show only for people
 * who code: always or never if you say so, and otherwise automatically, from when you connect a
 * project or a mate starts coding for you. Until then, code work shows as a card in the mate's
 * chat, like any other job.
 */

export type CodingPreference = "auto" | "on" | "off";

export const DEFAULT_CODING: { preference: CodingPreference; engaged: boolean } = { preference: "auto", engaged: false };

export const CODING_CHOICES: { value: CodingPreference; label: string; detail: string }[] = [
  { value: "auto", label: "Automatic", detail: "Shows once you connect a project or a mate codes for you." },
  { value: "on", label: "Always", detail: "Projects, runs and the coding tools are always there." },
  { value: "off", label: "Never", detail: "Code work stays as cards in your mates' chats." },
];

/** Whether the coding tools show: your choice, or in Automatic, whether you've started coding. */
export function showsCoding(preference: CodingPreference, signals: { engaged: boolean; hasProjects: boolean }): boolean {
  if (preference === "on") return true;
  if (preference === "off") return false;
  return signals.engaged || signals.hasProjects;
}

/** What onboarding's "Do you write code or build websites?" sets. A no still lets it turn on by itself. */
export const preferenceFromOnboarding = (codes: boolean): CodingPreference => (codes ? "on" : "auto");

/** A saved preference, with anything unreadable falling back to Automatic, not started. */
export function parseCoding(saved: string | null): typeof DEFAULT_CODING {
  if (!saved) return DEFAULT_CODING;
  try {
    const value = JSON.parse(saved) as Partial<typeof DEFAULT_CODING>;
    return {
      preference: value.preference === "on" || value.preference === "off" || value.preference === "auto" ? value.preference : "auto",
      engaged: value.engaged === true,
    };
  } catch {
    return DEFAULT_CODING;
  }
}
