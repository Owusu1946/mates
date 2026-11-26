import { useClerk, useSignIn } from "@clerk/electron/react";
import type { Screen } from "../onboarding/OnboardingFlow.logic.ts";
import { plainError, readClerkError, type ReadError } from "./clerkErrors.logic.ts";
import { signInNext } from "./signInNext.logic.ts";

/**
 * Where a step leaves you: signed in (the session is now active, so the app takes over), on to
 * another screen with a line for it, or still here with an error to show.
 */
export type AuthStep = { kind: "done" } | { kind: "go"; to: Screen; notice?: string } | { kind: "error"; error: ReadError };

const fail = (error: unknown): AuthStep => ({ kind: "error", error: readClerkError(error) });
const go = (to: Screen, notice?: string): AuthStep => ({ kind: "go", to, notice });

/**
 * Signing in with email, step for step as on the phone (apps/mobile/app/(public)/sign-in.tsx):
 * a password or an emailed code, then whatever Clerk still asks for (a code on a new device, or a
 * new password), then finalize, which makes the session active.
 */
export function useEmailSignIn() {
  const { signIn } = useSignIn();

  async function finish(): Promise<AuthStep> {
    const { error } = await signIn.finalize();
    return error ? fail(error) : { kind: "done" };
  }

  async function afterFirstFactor(email: string): Promise<AuthStep> {
    switch (signInNext(signIn.status, signIn.supportedSecondFactors)) {
      case "complete":
        return finish();
      case "deviceCode": {
        const { error } = await signIn.mfa.sendEmailCode();
        if (error) return fail(error);
        return go("signInDevice", signIn.status === "needs_client_trust" ? "New device. For your security, we emailed you a code." : "We emailed you a code to finish signing in.");
      }
      case "newPassword":
        return sendReset(email, "Your password needs to be changed before you can sign in. We emailed you a code.");
      case "unsupported":
        return { kind: "error", error: plainError("This account needs a verification method the desktop doesn’t support yet. Sign in with Apple or Google, or contact support.") };
      default:
        return { kind: "error", error: plainError("This sign-in needs another step. Please try again, or contact support.") };
    }
  }

  async function withPassword(email: string, password: string): Promise<AuthStep> {
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) {
      // A breached password can't be used to sign in: go straight to setting a new one.
      if (readClerkError(error).codes.includes("form_password_pwned")) return sendReset(email, "Your password appeared in a data breach, so it can’t be used anymore. We emailed you a code to set a new one.");
      return fail(error);
    }
    return afterFirstFactor(email);
  }

  async function sendCode(email: string): Promise<AuthStep> {
    const { error } = await signIn.emailCode.sendCode({ emailAddress: email });
    return error ? fail(error) : go("signInCode", "We emailed you a code.");
  }

  async function resendCode(email: string): Promise<ReadError | null> {
    const { error } = await signIn.emailCode.sendCode({ emailAddress: email });
    return error ? readClerkError(error) : null;
  }

  async function verifyCode(email: string, code: string): Promise<AuthStep> {
    const { error } = await signIn.emailCode.verifyCode({ code });
    return error ? fail(error) : afterFirstFactor(email);
  }

  async function resendDeviceCode(): Promise<ReadError | null> {
    const { error } = await signIn.mfa.sendEmailCode();
    return error ? readClerkError(error) : null;
  }

  async function verifyDeviceCode(code: string): Promise<AuthStep> {
    const { error } = await signIn.mfa.verifyEmailCode({ code });
    if (error) return fail(error);
    return signIn.status === "complete" ? finish() : { kind: "error", error: plainError("That didn’t finish signing you in. Please try again.") };
  }

  async function sendReset(email: string, notice = "A reset code is on its way. Check your inbox and spam folder."): Promise<AuthStep> {
    const { error: createError } = await signIn.create({ identifier: email });
    if (createError) return fail(createError);
    const { error } = await signIn.resetPasswordEmailCode.sendCode();
    return error ? fail(error) : go("signInReset", notice);
  }

  async function resendReset(): Promise<ReadError | null> {
    const { error } = await signIn.resetPasswordEmailCode.sendCode();
    return error ? readClerkError(error) : null;
  }

  async function verifyReset(code: string): Promise<AuthStep> {
    const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code });
    return error ? fail(error) : go("signInNewPassword");
  }

  async function submitNewPassword(email: string, password: string): Promise<AuthStep> {
    const { error } = await signIn.resetPasswordEmailCode.submitPassword({ password });
    if (error) return fail(error);
    if (signIn.status === "complete" || signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") return afterFirstFactor(email);
    return go("signInPassword", "Password updated. You can sign in now.");
  }

  return { withPassword, sendCode, resendCode, verifyCode, resendDeviceCode, verifyDeviceCode, sendReset, resendReset, verifyReset, submitNewPassword };
}

/**
 * The instance's minimum password length, so choosing one can say it up front. Read from Clerk's
 * loaded environment (as clerk-errors.ts on the phone); undefined if it isn't available, in which
 * case Clerk's own error still lands under the password field.
 */
export function usePasswordMinLength(): number | undefined {
  const clerk = useClerk() as unknown as { __internal_environment?: { userSettings?: { passwordSettings?: { min_length?: number } } } | null };
  const length = clerk.__internal_environment?.userSettings?.passwordSettings?.min_length;
  return typeof length === "number" && length > 0 ? length : undefined;
}
