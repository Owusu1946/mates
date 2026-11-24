import { useState, type FormEvent } from "react";
import { Button } from "../components/ui/Button.tsx";
import { OrDivider } from "../components/ui/OrDivider.tsx";
import { TextField } from "../components/ui/TextField.tsx";
import { isEmail, type SocialProvider } from "./OnboardingFlow.logic.ts";
import { OnboardingScreen } from "./OnboardingScreen.tsx";
import { SocialButtons } from "./SocialButtons.tsx";

/** A new account: Apple, Google or email, as on the phone. */
export function SignUpScreen({ email: initialEmail, onBack, onEmail, onSocial, onSignIn }: { email: string; onBack: () => void; onEmail: (email: string) => void; onSocial: (provider: SocialProvider) => void; onSignIn: () => void }) {
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
      <OnboardingScreen.Body>Free, and it only takes a moment.</OnboardingScreen.Body>
      <OnboardingScreen.Content>
        <SocialButtons onChoose={onSocial} />
        <OrDivider />
        <form className="flex flex-col gap-3.5" onSubmit={submit} noValidate>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            error={error}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
          />
          <Button type="submit" size="xl" icon="mail" className="w-full">
            Continue with email
          </Button>
        </form>
      </OnboardingScreen.Content>
      <OnboardingScreen.Footer>
        Already have an account?{" "}
        <Button variant="link" size="xs" onClick={onSignIn}>
          Sign in
        </Button>
      </OnboardingScreen.Footer>
    </OnboardingScreen.Root>
  );
}
