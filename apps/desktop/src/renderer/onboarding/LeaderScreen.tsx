import type { PolygonState, ShapeName } from "@muse-clone/mascot";
import { useEffect, useRef, useState } from "react";
import { gradientOf, type MateColor } from "../theme/matePalette.ts";
import { ColorPicker, ShapePicker } from "../components/MatePickers.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { Mascot } from "../components/ui/Mascot.tsx";
import { MAX_NAME, dayNameFor, isValidName, nameHint, nextDayName } from "./LeaderSetup.logic.ts";
import { OnboardingScreen } from "./OnboardingScreen.tsx";
import { cn } from "../lib/utils.ts";

export type Leader = { name: string; shape: ShapeName; color: MateColor };

/**
 * Right after sign-up, as on the phone: name the lead mate (today's day name to start, a
 * shuffle for the other six, or your own), pick a shape and a colour, and watch it react.
 */
export function LeaderScreen({ onDone }: { onDone: (leader: Leader) => void }) {
  const today = new Date().getDay();
  const [name, setName] = useState<string>(() => dayNameFor(new Date()));
  const [shape, setShape] = useState<ShapeName>("hexagon");
  const [color, setColor] = useState<MateColor>("amber");
  const [mood, setMood] = useState<PolygonState>("idle");
  const moodTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hint = nameHint(name);
  const valid = isValidName(name);

  useEffect(() => () => clearTimeout(moodTimer.current), []);

  // A happy face whenever something about it changes; no hop, since the app avoids bouncy motion.
  function react() {
    setMood("happy");
    clearTimeout(moodTimer.current);
    moodTimer.current = setTimeout(() => setMood("idle"), 1200);
  }

  return (
    <OnboardingScreen.Root>
      <OnboardingScreen.Title>Meet your lead mate</OnboardingScreen.Title>
      <OnboardingScreen.Body>Choose your lead mate's name and look.</OnboardingScreen.Body>
      <OnboardingScreen.Hero className="mt-5 mb-0 h-40">
        <Mascot size={150} state={mood} gradient={gradientOf(color)} shape={shape} />
      </OnboardingScreen.Hero>
      <OnboardingScreen.Content>
        <form
          className="flex flex-col gap-3.5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) onDone({ name: name.trim(), shape, color });
          }}
        >
          <div className={cn("flex items-center rounded-xl border border-field-line bg-canvas pl-11 shadow-xs/5 transition-shadow focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/20 dark:bg-field-line/30", hint.problem && "border-danger/60")}>
            <input
              value={name}
              maxLength={MAX_NAME}
              aria-label="Your lead mate's name"
              aria-describedby="leader-name-hint"
              className="h-12 min-w-0 flex-1 bg-transparent text-center text-lg font-semibold outline-none"
              spellCheck={false}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => name.trim() && react()}
            />
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-lg text-ink-soft transition-colors hover:text-ink"
              aria-label="Try another day name"
              onClick={() => {
                setName(nextDayName(name, today));
                react();
              }}
            >
              <Icon name="shuffle" />
            </button>
          </div>
          <p id="leader-name-hint" className={cn("-mt-1.5 text-center text-xs", hint.problem ? "text-danger-ink" : "text-ink-soft")} role={hint.problem ? "alert" : undefined}>
            {hint.text}
          </p>

          <ShapePicker
            shape={shape}
            color={color}
            onChange={(option) => {
              setShape(option);
              react();
            }}
          />
          <ColorPicker
            color={color}
            onChange={(option) => {
              setColor(option);
              react();
            }}
          />

          <Button type="submit" size="xl" className="w-full" disabled={!valid}>
            Create
          </Button>
        </form>
      </OnboardingScreen.Content>
    </OnboardingScreen.Root>
  );
}
