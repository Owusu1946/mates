import { pageText, type PageDoc } from "./schema.js";

/**
 * Personal details on a page, found before it's shared by link so the owner can decide with eyes
 * open. Deliberately broad: a false alarm costs one tap, a miss puts someone's number on the web.
 */

export type PersonalKind = "phone" | "email" | "address" | "number" | "person";
export type PersonalFinding = { kind: PersonalKind; sample: string };

const LABEL: Record<PersonalKind, [string, string]> = {
  phone: ["a phone number", "phone numbers"],
  email: ["an email address", "email addresses"],
  address: ["an address", "addresses"],
  number: ["an ID, card or account number", "ID, card or account numbers"],
  person: ["a friend's name", "friends' names"],
};

// Ghana numbers (024 123 4567, +233 24 123 4567, 0302…) and international ones (+44 20 7946 0958).
const PHONE = /(?:\+\d{1,3}[\s-]?)?\(?0?\d{2,3}\)?[\s-]?\d{3}[\s-]?\d{3,4}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// A house number with a street word, or a Ghana digital address (GA-123-4567).
const ADDRESS = /\b(?:\d{1,5}[A-Za-z]?\s+(?:[A-Z][a-z]+\s+){0,3}(?:Street|St|Road|Rd|Avenue|Ave|Close|Lane|Ln|Crescent|Drive|Dr|Way|Link)\b|[A-Z]{2}-\d{3,4}-\d{4})\b/g;
// Long digit runs: card and account numbers, Ghana Card (GHA-123456789-0), passport-like IDs.
const NUMBER = /\b(?:GHA-\d{9}-\d|(?:\d[ -]?){12,19}|[A-Z]\d{7,8})\b/g;

function matches(pattern: RegExp, text: string) {
  return [...text.matchAll(pattern)].map((m) => m[0].trim());
}

/** Personal details in the page; `friendNames` are the owner's friends (first names and nicknames). */
export function findPersonal(doc: PageDoc, friendNames: string[] = []): PersonalFinding[] {
  const found = new Map<string, PersonalFinding>();
  const add = (kind: PersonalKind, sample: string) => found.set(`${kind}:${sample.toLowerCase()}`, { kind, sample });
  const names = friendNames.map((n) => n.trim()).filter((n) => n.length >= 3);
  for (const text of pageText(doc)) {
    for (const sample of matches(NUMBER, text)) add("number", sample);
    for (const sample of matches(PHONE, text)) if (sample.replace(/\D/g, "").length >= 9 && !found.has(`number:${sample.toLowerCase()}`)) add("phone", sample);
    for (const sample of matches(EMAIL, text)) add("email", sample);
    for (const sample of matches(ADDRESS, text)) add("address", sample);
    for (const name of names) if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) add("person", name);
  }
  return [...found.values()];
}

/** "a phone number and an address" for the warning sheet and the push. */
export function describePersonal(findings: PersonalFinding[]): string {
  const counts = new Map<PersonalKind, number>();
  for (const f of findings) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  const parts = [...counts].map(([kind, n]) => LABEL[kind][n > 1 ? 1 : 0]);
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** Findings in `after` that weren't in `before`: what an update newly put on a shared page. */
export function newPersonal(before: PersonalFinding[], after: PersonalFinding[]): PersonalFinding[] {
  const seen = new Set(before.map((f) => `${f.kind}:${f.sample.toLowerCase()}`));
  return after.filter((f) => !seen.has(`${f.kind}:${f.sample.toLowerCase()}`));
}
