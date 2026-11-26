import { useEffect, useRef, useState } from "react";
import type { ReadError } from "../auth/clerkErrors.logic.ts";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { Mascot } from "../components/ui/Mascot.tsx";
import { cn } from "../lib/utils.ts";
import { PROVIDER_NAME, type SocialProvider } from "./OnboardingFlow.logic.ts";
import { OnboardingScreen } from "./OnboardingScreen.tsx";

/**
 * Apple or Google happen in your normal browser, where your accounts already are; this screen
 * waits for the mates://app/ link back (useSocialSignIn). Once signed in, the app replaces it.
 */
export function BrowserScreen({ provider, onBack, onStart }: { provider: SocialProvider; onBack: () => void; onStart: (provider: SocialProvider) => Promise<ReadError | null> }) {
  const name = PROVIDER_NAME[provider];
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<ReadError | null>(null);
  // Which attempt opened the browser, so a remount in development doesn't open it twice.
  const opened = useRef(-1);
  const latest = useRef(0);

  useEffect(() => {
    latest.current = attempt;
    if (opened.current !== attempt) {
      opened.current = attempt;
      setError(null);
      void onStart(provider).then((failed) => {
        // An older attempt, or one given up on with Cancel, has nothing left to say.
        if (latest.current === attempt) setError(failed);
      });
    }
    return () => {
      latest.current = -1;
    };
  }, [attempt, onStart, provider]);

  return (
    <OnboardingScreen.Root>
      <OnboardingScreen.Back onClick={onBack} label="Cancel" />
      <OnboardingScreen.Hero className="relative">
        <Mascot size={96} state={error ? "idle" : "searching"} />
        <span className="absolute -right-1 bottom-0 flex size-9 items-center justify-center rounded-full border border-line bg-raised shadow-xs/5">
          <Icon name={provider} size={18} />
        </span>
      </OnboardingScreen.Hero>
      <OnboardingScreen.Title>{error ? "That didn’t work" : "Continue in your browser"}</OnboardingScreen.Title>
      <OnboardingScreen.Body>{error ? error.message : <>We opened {name} in your browser. Choose your account there, and you'll come straight back here.</>}</OnboardingScreen.Body>
      <OnboardingScreen.Actions className="flex flex-col items-center gap-4">
        {!error && (
          <p role="status" className="flex items-center gap-2 text-sm text-ink-soft">
            <span className={cn("size-2 animate-pulse rounded-full bg-brand")} />
            Waiting for {name}…
          </p>
        )}
        <Button variant="outline" size="lg" icon="external" onClick={() => setAttempt(attempt + 1)}>
          {error ? "Try again" : "Open the browser again"}
        </Button>
      </OnboardingScreen.Actions>
      <OnboardingScreen.Footer>
        Trouble?{" "}
        <Button variant="link" size="xs" onClick={onBack}>
          Use email instead
        </Button>
      </OnboardingScreen.Footer>
    </OnboardingScreen.Root>
  );
}
