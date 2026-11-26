/**
 * What a sign-in needs after the password or code, as on the phone (sign-in.tsx, afterFirstFactor):
 * finish, a code by email (a new device, or a second factor), or a new password.
 */

export type SignInNext = "complete" | "deviceCode" | "newPassword" | "unsupported" | "unknown";

export function signInNext(status: string | null, secondFactors: readonly { strategy: string }[] | null | undefined): SignInNext {
  if (status === "complete") return "complete";
  if (status === "needs_client_trust" || status === "needs_second_factor")
    return secondFactors?.some((factor) => factor.strategy === "email_code") ? "deviceCode" : "unsupported";
  if (status === "needs_new_password") return "newPassword";
  return "unknown";
}
