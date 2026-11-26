import { useEffect, useState } from "react";
import { errorFor, type ReadError } from "../auth/clerkErrors.logic.ts";
import { Button } from "../components/ui/Button.tsx";
import { CodeInput } from "../components/ui/CodeInput.tsx";
import { OnboardingScreen } from "./OnboardingScreen.tsx";

/** As on the phone: a new code can be asked for 30 seconds after the last one. */
const RESEND_AFTER = 30;

type CodeScreenProps = {
  /** Verifying a new account's email, signing in, a new device, or a password reset. */
  mode: "signUp" | "signIn" | "device" | "reset";
  email: string;
  /** A line from the step before, like "New device. We emailed you a code." */
  notice?: string;
  onBack: () => void;
  /** Resolves with an error to show, or null once the flow has moved on. */
  onVerify: (code: string) => Promise<ReadError | null>;
  onResend: () => Promise<ReadError | null>;
};

const TITLE = { signUp: "Verify your email", signIn: "Check your inbox", device: "Confirm it’s you", reset: "Reset your password" };

/** The six-digit code Clerk emails; it sends itself once all six digits are in. */
export function CodeScreen({ mode, email, notice, onBack, onVerify, onResend }: CodeScreenProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<ReadError | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The step before just sent a code, so the wait starts now.
  const [cooldown, setCooldown] = useState(RESEND_AFTER);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function verify(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      const failed = await onVerify(value);
      setError(failed);
      if (failed) setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setError(null);
    try {
      const failed = await onResend();
      setError(failed);
      if (!failed) {
        setCode("");
        setCooldown(RESEND_AFTER);
        setSent("A new code is on its way. Check your inbox and spam folder.");
      }
    } finally {
      setBusy(false);
    }
  }

  const message = errorFor(error, "code");
  return (
    <OnboardingScreen.Root>
      <OnboardingScreen.Back onClick={onBack} />
      <OnboardingScreen.Title>{TITLE[mode]}</OnboardingScreen.Title>
      <OnboardingScreen.Body>
        {notice ?? "We emailed you a code."} Enter it to continue as <strong>{email}</strong>.
      </OnboardingScreen.Body>
      <OnboardingScreen.Content>
        <CodeInput
          label="Verification code"
          value={code}
          onChange={(value) => {
            setCode(value);
            setError(null);
          }}
          onComplete={(value) => void verify(value)}
        />
        {(message || sent) && (
          <p role={message ? "alert" : "status"} className={message ? "text-center text-sm text-danger-ink" : "text-center text-sm text-ink-soft"}>
            {message ?? sent}
          </p>
        )}
        <Button size="xl" className="w-full" disabled={code.length < 6 || busy} onClick={() => void verify(code)}>
          {busy ? "One moment…" : mode === "signUp" ? "Verify email" : "Continue"}
        </Button>
      </OnboardingScreen.Content>
      <OnboardingScreen.Footer>
        <Button variant="link" size="xs" disabled={busy || cooldown > 0} onClick={() => void resend()}>
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
        </Button>
      </OnboardingScreen.Footer>
    </OnboardingScreen.Root>
  );
}
