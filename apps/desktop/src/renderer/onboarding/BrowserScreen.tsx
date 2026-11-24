import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { Mascot } from "../components/ui/Mascot.tsx";
import { cn } from "../lib/utils.ts";
import { PROVIDER_NAME, type SocialProvider } from "./OnboardingFlow.logic.ts";
import { OnboardingScreen } from "./OnboardingScreen.tsx";

/** How long the sample "browser" takes to send you back, and how long "Signed in" shows. */
const SAMPLE_RETURN_MS = 3200;
const SIGNED_IN_MS = 700;

/**
 * Apple or Google happen in your normal browser, where your accounts already are; this screen
 * waits for the mates:// link back. UI only: the sample comes back by itself after a moment.
 */
export function BrowserScreen({ provider, onBack, onDone }: { provider: SocialProvider; onBack: () => void; onDone: () => void }) {
  const name = PROVIDER_NAME[provider];
  const [attempt, setAttempt] = useState(0);
  const [back, setBack] = useState(false);

  useEffect(() => {
    const returned = setTimeout(() => setBack(true), SAMPLE_RETURN_MS);
    return () => clearTimeout(returned);
  }, [attempt]);

  useEffect(() => {
    if (!back) return;
    const done = setTimeout(onDone, SIGNED_IN_MS);
    return () => clearTimeout(done);
  }, [back, onDone]);

  return (
    <OnboardingScreen.Root>
      <OnboardingScreen.Back onClick={onBack} label="Cancel" />
      <OnboardingScreen.Hero className="relative">
        <Mascot size={96} state={back ? "happy" : "searching"} />
        <span className="absolute -right-1 bottom-0 flex size-9 items-center justify-center rounded-full border border-line bg-raised shadow-xs/5">
          <Icon name={provider} size={18} />
        </span>
      </OnboardingScreen.Hero>
      <OnboardingScreen.Title>{back ? "You're in" : "Continue in your browser"}</OnboardingScreen.Title>
      <OnboardingScreen.Body>
        {back ? (
          <>Signed in with {name}.</>
        ) : (
          <>
            We opened {name} in your browser. Choose your account there, and you'll come straight back here.
          </>
        )}
      </OnboardingScreen.Body>
      <OnboardingScreen.Actions className="flex flex-col items-center gap-4">
        <p role="status" className="flex items-center gap-2 text-sm text-ink-soft">
          <span className={cn("size-2 rounded-full", back ? "bg-ok" : "animate-pulse bg-brand")} />
          {back ? "Opening Mates…" : `Waiting for ${name}…`}
        </p>
        {!back && (
          <Button variant="outline" size="lg" icon="external" onClick={() => setAttempt(attempt + 1)}>
            Open the browser again
          </Button>
        )}
      </OnboardingScreen.Actions>
      {!back && (
        <OnboardingScreen.Footer>
          Trouble?{" "}
          <Button variant="link" size="xs" onClick={onBack}>
            Use email instead
          </Button>
        </OnboardingScreen.Footer>
      )}
    </OnboardingScreen.Root>
  );
}
