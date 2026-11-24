import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../components/ui/Button.tsx";
import { OrDivider } from "../components/ui/OrDivider.tsx";
import { TextField } from "../components/ui/TextField.tsx";
import { isEmail } from "./OnboardingFlow.logic.ts";
import { OnboardingScreen } from "./OnboardingScreen.tsx";
import { QrCode } from "./QrCode.tsx";
import { SocialButtons } from "./SocialButtons.tsx";

/** How long a sign-in code lasts before a new one replaces it (desktop-app.md, Signing in). */
const CODE_SECONDS = 120;

const newRequest = () => {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const pick = () => letters[Math.floor(Math.random() * letters.length)];
  return { id: crypto.randomUUID(), match: `${pick()}${Math.floor(Math.random() * 10)}-${String(Math.floor(Math.random() * 100)).padStart(2, "0")}` };
};

/**
 * For people who already use Mates. The fastest way in comes first: scan with the phone, check
 * the code matches. Apple, Google and email sit beside it for anyone without the phone app.
 */
export function SignInScreen({ email: initialEmail, onBack, onEmail, onCreateAccount }: { email: string; onBack: () => void; onEmail: (email: string) => void; onCreateAccount: () => void }) {
  const [request, setRequest] = useState(newRequest);
  const [left, setLeft] = useState(CODE_SECONDS);
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setLeft((seconds) => seconds - 1), 1000);
    return () => clearInterval(timer);
  }, []);
  // Expired: a fresh request, so a photo of the old code is useless.
  if (left <= 0) {
    setRequest(newRequest());
    setLeft(CODE_SECONDS);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isEmail(email)) return setError("Enter a valid email address.");
    onEmail(email.trim());
  }

  return (
    <OnboardingScreen.Root wide>
      <OnboardingScreen.Back onClick={onBack} />
      <OnboardingScreen.Title>Welcome back</OnboardingScreen.Title>
      <OnboardingScreen.Body>Sign in with the Mates account you already have.</OnboardingScreen.Body>
      <OnboardingScreen.Content className="grid items-center gap-10 min-[760px]:grid-cols-[minmax(0,1.15fr)_1px_minmax(0,1fr)] min-[760px]:before:col-start-2 min-[760px]:before:row-start-1 min-[760px]:before:self-stretch min-[760px]:before:bg-line min-[760px]:before:content-['']">
        <div className="flex items-center gap-6 max-[520px]:flex-col min-[760px]:col-start-1 min-[760px]:row-start-1">
          <QrCode seed={request.id} />
          <div className="[&_h2]:mb-2.5 [&_h2]:text-base [&_h2]:font-semibold">
            <h2>Scan with your phone</h2>
            <ol className="flex list-decimal flex-col gap-1.5 pl-4.5 text-[13px] text-ink-soft [&_strong]:text-ink">
              <li>Open Mates on your phone</li>
              <li>
                Tap <strong>Scan to sign in</strong>
              </li>
              <li>Check the code matches, then confirm</li>
            </ol>
            <div className="mt-4.5 flex flex-col gap-0.5">
              <span className="font-mono text-2xl font-semibold tracking-[0.08em]">{request.match}</span>
              <span className="text-xs text-ink-soft tabular-nums">
                New code in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4.5 min-[760px]:col-start-3 min-[760px]:row-start-1">
          <SocialButtons />
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
        </div>
      </OnboardingScreen.Content>
      <OnboardingScreen.Footer>
        New to Mates?{" "}
        <Button variant="link" onClick={onCreateAccount}>
          Create an account
        </Button>
      </OnboardingScreen.Footer>
    </OnboardingScreen.Root>
  );
}
