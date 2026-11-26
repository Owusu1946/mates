/**
 * Clerk's errors in the words the phone uses (apps/mobile/src/components/auth/clerk-errors.ts), so
 * a wrong password reads the same on both.
 */

export type AuthField = "email" | "password" | "code";
export type FieldErrors = Partial<Record<AuthField, string>>;
export type ReadError = { message: string; fields: FieldErrors; codes: string[] };

type ApiError = { code?: string; message?: string; longMessage?: string; meta?: { paramName?: string } };

const FIELD_OF: Record<string, AuthField> = {
  email_address: "email",
  identifier: "email",
  password: "password",
  new_password: "password",
  code: "code",
};

/** Clearer words than the API's for the errors people actually hit. */
const FRIENDLY: Record<string, string> = {
  form_identifier_exists: "There’s already an account with this email.",
  form_identifier_not_found: "There’s no account with this email.",
  form_password_incorrect: "That password isn’t right.",
  form_password_pwned: "This password has appeared in a data breach. Choose a different one.",
  form_code_incorrect: "That code isn’t right. Check it and try again.",
  verification_expired: "That code has expired. Send a new one.",
  verification_failed: "Too many wrong codes. Send a new one.",
  form_param_format_invalid: "Enter a valid email address.",
  too_many_requests: "Too many attempts. Wait a moment, then try again.",
  user_locked: "Too many attempts. This account is locked for a while; try again later.",
};

export const FALLBACK = "Something went wrong. Please try again.";

/**
 * Reads a Clerk error into a message for the screen and messages for the fields they belong to.
 * Clerk's `message` is meant for developers; `longMessage` is the user-facing text.
 */
export function readClerkError(error: unknown, fallback = FALLBACK): ReadError {
  const list = ((error as { errors?: ApiError[] } | null)?.errors ?? []).filter(Boolean);
  const fields: FieldErrors = {};
  const codes: string[] = [];
  let message: string | null = null;
  for (const item of list) {
    if (item.code) codes.push(item.code);
    const text = (item.code && FRIENDLY[item.code]) || item.longMessage || item.message || fallback;
    const field = item.meta?.paramName ? FIELD_OF[item.meta.paramName] : undefined;
    if (field && !fields[field]) fields[field] = text;
    else if (!message) message = text;
  }
  if (!list.length) {
    const top = error as { code?: string; longMessage?: string; message?: string } | null;
    if (top?.code) codes.push(top.code);
    message = (top?.code && FRIENDLY[top.code]) || top?.longMessage || fallback;
  }
  return { message: message ?? (Object.keys(fields).length ? "" : fallback), fields, codes };
}

/** A message of our own, shaped like a read error. */
export const plainError = (message: string): ReadError => ({ message, fields: {}, codes: [] });

/** The words for one field: its own error, or the screen's message when nothing claimed a field. */
export const errorFor = (error: ReadError | null, field: AuthField) => error?.fields[field] ?? (error && !Object.keys(error.fields).length ? error.message : null) ?? null;
