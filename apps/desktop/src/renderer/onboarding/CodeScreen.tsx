import { useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { CodeInput } from "../components/ui/CodeInput.tsx";
import { OnboardingScreen } from "./OnboardingScreen.tsx";

const SAMPLE_CODE = "246810";

/** Local verification for the sign-in and sign-up previews. */
export function CodeScreen({ mode, email, onBack, onDone }: { mode: "signIn" | "signUp"; email: string; onBack: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  function verify(value: string) {
    if (value === SAMPLE_CODE) onDone();
    else setError(true);
  }

  return (
    <OnboardingScreen.Root>
      <OnboardingScreen.Back onClick={onBack} />
      <OnboardingScreen.Title>Verify your email</OnboardingScreen.Title>
      <OnboardingScreen.Body>
        Use the sample code <strong className="tabular-nums">{SAMPLE_CODE}</strong> to continue as <strong>{email}</strong>.
      </OnboardingScreen.Body>
      <OnboardingScreen.Content>
        <CodeInput label="Verification code" value={code} onChange={(value) => { setCode(value); setError(false); }} onComplete={verify} />
        {error && <p role="status" className="text-center text-sm text-danger-ink">Use the sample code shown above.</p>}
        <Button size="xl" className="w-full" disabled={code.length < 6} onClick={() => verify(code)}>
          {mode === "signUp" ? "Verify email" : "Continue"}
        </Button>
      </OnboardingScreen.Content>
    </OnboardingScreen.Root>
  );
}
