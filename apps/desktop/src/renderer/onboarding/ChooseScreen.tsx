import { Button } from "../components/ui/Button.tsx";
import { Mascot } from "../components/ui/Mascot.tsx";
import { gradientOf } from "../theme/matePalette.ts";
import { OnboardingScreen } from "./OnboardingScreen.tsx";

/** The first screen: new to Mates, or already using it on the phone. */
export function ChooseScreen({ onNew, onExisting }: { onNew: () => void; onExisting: () => void }) {
  return (
    <OnboardingScreen.Root className="max-w-110">
      <OnboardingScreen.Hero className="mb-9">
        <span className="-mr-3.5 mt-14">
          <Mascot size={64} state="curious" gradient={gradientOf("teal")} shape="circle" />
        </span>
        <Mascot size={136} state="happy" />
        <span className="-ml-3.5 mt-14">
          <Mascot size={64} state="excited" gradient={gradientOf("rose")} shape="squircle" />
        </span>
      </OnboardingScreen.Hero>
      <h1 className="text-[34px] leading-[1.12] font-semibold tracking-[-0.025em] text-balance">Your crew, on your computer.</h1>
      <OnboardingScreen.Body className="mt-3 text-base">Mates remember you, plan with you, and get things done.</OnboardingScreen.Body>
      <OnboardingScreen.Actions className="mt-10 flex max-w-80 flex-col gap-1">
        <Button size="xl" className="w-full" onClick={onNew}>
          Get started
        </Button>
        <Button variant="ghost-muted" size="xl" className="w-full" onClick={onExisting}>
          I already have an account
        </Button>
      </OnboardingScreen.Actions>
    </OnboardingScreen.Root>
  );
}
