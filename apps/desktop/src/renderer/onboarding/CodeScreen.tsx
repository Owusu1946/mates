import { useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { CodeInput } from "../components/ui/CodeInput.tsx";
import { OnboardingScreen } from "./OnboardingScreen.tsx";

/**
 * The emailed code: confirming a new account's email, or signing in without the password.
 * Six digits in, and it carries on by itself.
 */
export function CodeScreen({ mode, email, onBack, onDone }: { mode: "signIn" | "signUp"; email: string; onBack: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);

  return (
    <OnboardingScreen.Root>
      <OnboardingScreen.Back onClick={onBack} />
      <OnboardingScreen.Title>Check your inbox</OnboardingScreen.Title>
      <OnboardingScreen.Body>
        {mode === "signUp" ? "To confirm it's you, we emailed a code to " : "We emailed a code to finish signing in to "}
        <strong>{email}</strong>
      </OnboardingScreen.Body>
      <OnboardingScreen.Content>
        <CodeInput label="Verification code" value={code} onChange={setCode} onComplete={onDone} />
        <Button size="xl" className="w-full" disabled={code.length < 6} onClick={onDone}>
          {mode === "signUp" ? "Verify email" : "Continue"}
        </Button>
      </OnboardingScreen.Content>
      <OnboardingScreen.Footer>
        {resent ? (
          <span role="status">Sent. It can take a minute to arrive.</span>
        ) : (
          <>
            Didn't get it?{" "}
            <Button variant="link" onClick={() => setResent(true)}>
              Send again
            </Button>
          </>
        )}
      </OnboardingScreen.Footer>
    </OnboardingScreen.Root>
  );
}
