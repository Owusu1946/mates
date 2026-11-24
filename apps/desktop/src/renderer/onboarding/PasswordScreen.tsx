import { useState, type FormEvent } from "react";
import { Button } from "../components/ui/Button.tsx";
import { TextField } from "../components/ui/TextField.tsx";
import { MIN_PASSWORD } from "./OnboardingFlow.logic.ts";
import { OnboardingScreen } from "./OnboardingScreen.tsx";

type PasswordScreenProps = {
  mode: "signIn" | "signUp";
  email: string;
  onBack: () => void;
  onDone: () => void;
  /** Signing in: get a code by email instead of typing the password. */
  onUseCode?: () => void;
};

/** The password, after the email: signing in with an existing one, or choosing one for a new account. */
export function PasswordScreen({ mode, email, onBack, onDone, onUseCode }: PasswordScreenProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const signIn = mode === "signIn";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!password) return setError("Enter your password.");
    if (!signIn && password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    onDone();
  }

  return (
    <OnboardingScreen.Root>
      <OnboardingScreen.Back onClick={onBack} />
      <OnboardingScreen.Title>{signIn ? "Enter your password" : "Choose a password"}</OnboardingScreen.Title>
      <OnboardingScreen.Body>
        {signIn ? "Signing in as " : "Creating an account for "}
        <strong>{email}</strong>
      </OnboardingScreen.Body>
      <OnboardingScreen.Content>
        <form className="flex flex-col gap-3.5" onSubmit={submit} noValidate>
          <TextField
            label="Password"
            type="password"
            autoComplete={signIn ? "current-password" : "new-password"}
            autoFocus
            value={password}
            hint={signIn ? null : `At least ${MIN_PASSWORD} characters. Make it something you haven't used before.`}
            error={error}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
          />
          <Button type="submit" size="xl" className="w-full">
            {signIn ? "Sign in" : "Create account"}
          </Button>
        </form>
      </OnboardingScreen.Content>
      {onUseCode && (
        <OnboardingScreen.Footer>
          <Button variant="link" onClick={onUseCode}>
            Email me a code instead
          </Button>
          <span aria-hidden="true">·</span>
          <Button variant="link" onClick={onUseCode}>
            Forgot password?
          </Button>
        </OnboardingScreen.Footer>
      )}
    </OnboardingScreen.Root>
  );
}
