import { useState, type FormEvent } from "react";
import { errorFor, type ReadError } from "../auth/clerkErrors.logic.ts";
import { Button } from "../components/ui/Button.tsx";
import { TextField } from "../components/ui/TextField.tsx";
import { MIN_PASSWORD } from "./OnboardingFlow.logic.ts";
import { OnboardingScreen } from "./OnboardingScreen.tsx";

type PasswordScreenProps = {
  /** Signing in, choosing one for a new account, or setting a new one after a reset. */
  mode: "signIn" | "signUp" | "reset";
  email: string;
  /** A line from the step before, like "Password updated". */
  notice?: string;
  /** Clerk's minimum, when it's known; otherwise ours. */
  minLength?: number;
  onBack: () => void;
  /** Resolves with an error to show, or null once the flow has moved on. */
  onSubmit: (password: string) => Promise<ReadError | null>;
  /** Signing in: a code by email instead. */
  onUseCode?: () => Promise<ReadError | null>;
  /** Signing in: a reset code by email. */
  onForgot?: () => Promise<ReadError | null>;
};

const TITLE = { signIn: "Enter your password", signUp: "Choose a password", reset: "Choose a new password" };
const LEAD = { signIn: "Signing in as ", signUp: "Creating an account for ", reset: "A new password for " };
const SUBMIT = { signIn: "Sign in", signUp: "Create account", reset: "Save and sign in" };

/** The password, after the email: signing in with an existing one, or choosing one. */
export function PasswordScreen({ mode, email, notice, minLength = MIN_PASSWORD, onBack, onSubmit, onUseCode, onForgot }: PasswordScreenProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ReadError | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const choosing = mode !== "signIn";

  async function run(action: () => Promise<ReadError | null>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setLocalError(null);
    try {
      setError(await action());
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!password) return setLocalError("Enter your password.");
    if (choosing && password.length < minLength) return setLocalError(`Use at least ${minLength} characters.`);
    void run(() => onSubmit(password));
  }

  const message = error && !errorFor(error, "password") ? error.message : null;
  return (
    <OnboardingScreen.Root>
      <OnboardingScreen.Back onClick={onBack} />
      <OnboardingScreen.Title>{TITLE[mode]}</OnboardingScreen.Title>
      <OnboardingScreen.Body>
        {notice ? (
          notice
        ) : (
          <>
            {LEAD[mode]}
            <strong>{email}</strong>
          </>
        )}
      </OnboardingScreen.Body>
      <OnboardingScreen.Content>
        <form className="flex flex-col gap-3.5" onSubmit={submit} noValidate>
          {/* The email, for password managers to pair with what's typed below. */}
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <TextField
            label={mode === "reset" ? "New password" : "Password"}
            type="password"
            autoComplete={choosing ? "new-password" : "current-password"}
            autoFocus
            value={password}
            disabled={busy}
            hint={choosing ? `At least ${minLength} characters.` : null}
            error={localError ?? errorFor(error, "password")}
            onChange={(event) => {
              setPassword(event.target.value);
              setLocalError(null);
              setError(null);
            }}
          />
          {message && (
            <p role="alert" className="-mt-1 text-sm text-danger-ink">
              {message}
            </p>
          )}
          <Button type="submit" size="xl" className="w-full" disabled={busy}>
            {busy ? "One moment…" : SUBMIT[mode]}
          </Button>
          {onForgot && (
            <Button variant="link" size="xs" className="self-center" disabled={busy} onClick={() => void run(onForgot)}>
              Forgot your password?
            </Button>
          )}
        </form>
      </OnboardingScreen.Content>
      {onUseCode && (
        <OnboardingScreen.Footer>
          <Button variant="outline" size="sm" icon="hash" disabled={busy} onClick={() => void run(onUseCode)}>
            Email me a code instead
          </Button>
        </OnboardingScreen.Footer>
      )}
    </OnboardingScreen.Root>
  );
}
