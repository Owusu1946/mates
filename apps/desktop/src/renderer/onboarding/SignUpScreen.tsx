import { useState, type FormEvent } from "react";
import { Button } from "../components/ui/Button.tsx";
import { TextField } from "../components/ui/TextField.tsx";
import { isEmail } from "./OnboardingFlow.logic.ts";
import { OnboardingScreen } from "./OnboardingScreen.tsx";

export function SignUpScreen({ email: initialEmail, onBack, onEmail, onSignIn }: { email: string; onBack: () => void; onEmail: (email: string) => void; onSignIn: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isEmail(email)) return setError("Enter a valid email address.");
    onEmail(email.trim());
  }

  return (
    <OnboardingScreen.Root>
      <OnboardingScreen.Back onClick={onBack} />
      <OnboardingScreen.Title>Create your account</OnboardingScreen.Title>
      <OnboardingScreen.Body>Use a sample email to set up your crew.</OnboardingScreen.Body>
      <OnboardingScreen.Content>
        <form className="flex flex-col gap-3.5" onSubmit={submit} noValidate>
          <TextField
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            error={error}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
          />
          <Button type="submit" size="xl" className="w-full">
            Continue with email
          </Button>
        </form>
      </OnboardingScreen.Content>
      <OnboardingScreen.Footer>
        Already have an account?{" "}
        <Button variant="link" onClick={onSignIn}>
          Sign in
        </Button>
      </OnboardingScreen.Footer>
    </OnboardingScreen.Root>
  );
}
