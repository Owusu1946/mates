import { useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { Mascot } from "../components/ui/Mascot.tsx";
import { TextArea, TextField } from "../components/ui/TextField.tsx";
import { gradientOf } from "../theme/matePalette.ts";
import type { Leader } from "./LeaderScreen.tsx";
import { OnboardingScreen } from "./OnboardingScreen.tsx";

/** As on the phone (apps/mobile/src/onboarding/about-data.ts). */
const MAX_BIO = 4_000;

/** Starters for people who don't know where to begin: each adds a line to finish in their words. */
const PROMPTS = [
  { label: "What you do", line: "I work as " },
  { label: "Your people", line: "The people who matter most to me are " },
  { label: "What to help with", line: "I'd love help with " },
  { label: "How you like things", line: "I like things done " },
];

/**
 * Tell the new lead mate about yourself. Skippable, since the mates also learn as you chat; the
 * name is the one friends see (sign-up never asks for it). One question decides whether Mates
 * shows its coding tools from the start; a no still lets them appear once you start coding.
 */
export function AboutScreen({ leader, onDone }: { leader: Leader; onDone: (myName: string, bio: string, codes: boolean) => Promise<string | null> }) {
  const [myName, setMyName] = useState("");
  const [bio, setBio] = useState("");
  const [codes, setCodes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = bio.trim().length >= 3;

  /** Saves, then the flow moves on; a failure shows here, and pressing again retries. */
  function save(text: string) {
    if (saving) return;
    setSaving(true);
    setError(null);
    void onDone(myName.trim(), text, codes).then((failed) => {
      setError(failed);
      setSaving(false);
    });
  }

  function addLine(line: string) {
    setBio((text) => (!text.trim() ? line : /\n$/.test(text) ? text + line : `${text}\n${line}`).slice(0, MAX_BIO));
  }

  return (
    <OnboardingScreen.Root>
      <OnboardingScreen.Hero className="mb-4">
        <Mascot size={72} gradient={gradientOf(leader.color)} shape={leader.shape} still />
      </OnboardingScreen.Hero>
      <OnboardingScreen.Title>Tell {leader.name} about yourself</OnboardingScreen.Title>
      <OnboardingScreen.Body>
        Your name is the one friends see. A short introduction helps {leader.name} from the first chat.
      </OnboardingScreen.Body>
      <OnboardingScreen.Content>
        <form
          className="flex flex-col gap-3.5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) save(bio.trim());
          }}
        >
          <TextField label="What should your mates call you?" placeholder="Your first name" maxLength={40} value={myName} onChange={(event) => setMyName(event.target.value)} />
          <TextArea
            label="About you"
            rows={6}
            maxLength={MAX_BIO}
            placeholder={`What you do, who matters to you, what you'd like ${leader.name} to help with…`}
            value={bio}
            hint={bio.length > MAX_BIO - 400 ? `${MAX_BIO - bio.length} characters left` : null}
            onChange={(event) => setBio(event.target.value)}
          />
          <div className="-mt-1 flex flex-wrap gap-1.5">
            {PROMPTS.map((prompt) => (
              <button key={prompt.label} type="button" className="h-7.5 rounded-full bg-hover-fill px-3 text-xs text-ink-soft transition-colors hover:text-ink" onClick={() => addLine(prompt.line)}>
                {prompt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
            <span className="text-sm">Do you write code or build websites?</span>
            <div role="radiogroup" aria-label="Do you write code or build websites?" className="flex shrink-0 gap-0.5 rounded-lg bg-soft p-0.5">
              {[
                { value: true, label: "Yes" },
                { value: false, label: "Not really" },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={codes === option.value}
                  onClick={() => setCodes(option.value)}
                  className="h-7 rounded-md px-3 text-xs whitespace-nowrap text-ink-soft transition-colors aria-checked:bg-raised aria-checked:text-ink aria-checked:shadow-xs"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p role="alert" className="text-center text-sm text-danger-ink">
              {error}
            </p>
          )}
          <Button type="submit" size="xl" className="w-full" disabled={!ready || saving}>
            {saving ? "Saving…" : error ? "Try again" : "Continue"}
          </Button>
        </form>
      </OnboardingScreen.Content>
      <OnboardingScreen.Footer className="mt-3">
        <Button variant="ghost-muted" size="sm" disabled={saving} onClick={() => save("")}>
          Skip for now
          <Icon name="arrowRight" />
        </Button>
      </OnboardingScreen.Footer>
    </OnboardingScreen.Root>
  );
}
