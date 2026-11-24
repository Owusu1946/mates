import { Button } from "../components/ui/Button.tsx";
import type { SocialProvider } from "./OnboardingFlow.logic.ts";

/**
 * Apple and Google, as on the phone. Each opens your normal browser to pick an account, then comes
 * back through a mates:// link (@clerk/electron; desktop-app.md, Signing in).
 */
export function SocialButtons({ onChoose }: { onChoose: (provider: SocialProvider) => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Button variant="outline" size="xl" icon="apple" className="w-full" onClick={() => onChoose("apple")}>
        Continue with Apple
      </Button>
      <Button variant="outline" size="xl" icon="google" className="w-full" onClick={() => onChoose("google")}>
        Continue with Google
      </Button>
    </div>
  );
}
