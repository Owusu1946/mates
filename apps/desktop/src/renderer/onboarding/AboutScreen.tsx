import { useState } from "react";
import { Button } from "../components/ui/Button.tsx";
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
 * name is the one friends see (sign-up never asks for it).
 */
export function AboutScreen({ leader, onDone }: { leader: Leader; onDone: (myName: string) => void }) {
  const [myName, setMyName] = useState("");
  const [bio, setBio] = useState("");
  const ready = bio.trim().length >= 3;

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
        The more {leader.name} knows, the more {leader.name} can do for you. Your other mates get the parts that matter to them.
      </OnboardingScreen.Body>
      <OnboardingScreen.Content>
        <form
          className="flex flex-col gap-3.5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) onDone(myName.trim());
          }}
        >
          <TextField label="What should friends call you?" placeholder="Your first name" autoComplete="given-name" maxLength={40} value={myName} onChange={(event) => setMyName(event.target.value)} />
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
          <Button type="submit" size="xl" className="w-full" disabled={!ready}>
            Continue
          </Button>
        </form>
      </OnboardingScreen.Content>
      <OnboardingScreen.Footer>
        <Button variant="link" onClick={() => onDone(myName.trim())}>
          Skip for now
        </Button>
      </OnboardingScreen.Footer>
    </OnboardingScreen.Root>
  );
}
