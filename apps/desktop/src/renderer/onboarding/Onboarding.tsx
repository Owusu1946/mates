import { useEffect, useReducer, useState } from "react";
import type { SampleProfile } from "../data/sampleCrew.ts";
import { useStableCallback } from "../hooks/useStableCallback.ts";
import { AboutScreen } from "./AboutScreen.tsx";
import { BrowserScreen } from "./BrowserScreen.tsx";
import { ChooseScreen } from "./ChooseScreen.tsx";
import { CodeScreen } from "./CodeScreen.tsx";
import { ImportScreen } from "./ImportScreen.tsx";
import { LeaderScreen, type Leader } from "./LeaderScreen.tsx";
import { INITIAL_FLOW, flowReducer, newcomerStep, type Screen, type SocialProvider } from "./OnboardingFlow.logic.ts";
import { PasswordScreen } from "./PasswordScreen.tsx";
import { SignInScreen } from "./SignInScreen.tsx";
import { SignUpScreen } from "./SignUpScreen.tsx";
import { StepIndicator } from "./StepIndicator.tsx";
import { cn } from "../lib/utils.ts";

export type OnboardingResult = { kind: "signedIn" } | { kind: "joined"; leader: Leader; myName: string; profile: SampleProfile; codes: boolean };

/**
 * Preview the sign-in and setup flows before opening the sample workspace.
 */
export function Onboarding({ start = "choose", onFinish }: { start?: Screen; onFinish: (result: OnboardingResult) => void }) {
  const [flow, dispatch] = useReducer(flowReducer, { ...INITIAL_FLOW, screen: start });
  const [leader, setLeader] = useState<Leader | null>(null);
  const [about, setAbout] = useState({ name: "", bio: "", codes: false });
  const step = newcomerStep(flow.screen);

  const go = (to: Screen, email?: string, provider?: SocialProvider) => dispatch({ type: "go", to, email, provider });
  const back = () => dispatch({ type: "back" });
  // Apple or Google already confirmed the email, so a new account skips the password and code.
  const signedIn = useStableCallback(() => onFinish({ kind: "signedIn" }));
  const joined = useStableCallback(() => go("leader"));

  // Escape steps back, like a sheet closing; the setup steps after sign-up have nowhere to go back to.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) dispatch({ type: "back" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function screen() {
    switch (flow.screen) {
      case "choose":
        return <ChooseScreen onNew={() => go("signUp")} onExisting={() => go("signIn")} />;
      case "signIn":
        return <SignInScreen email={flow.email} onBack={back} onEmail={(email) => go("signInPassword", email)} onSocial={(provider) => go("signInSocial", undefined, provider)} onCreateAccount={() => go("signUp")} />;
      case "signInPassword":
        return <PasswordScreen mode="signIn" email={flow.email} onBack={back} onDone={() => onFinish({ kind: "signedIn" })} onUseCode={() => go("signInCode")} />;
      case "signInCode":
        return <CodeScreen mode="signIn" email={flow.email} onBack={back} onDone={() => onFinish({ kind: "signedIn" })} />;
      case "signInSocial":
        return <BrowserScreen provider={flow.provider ?? "google"} onBack={back} onDone={signedIn} />;
      case "signUp":
        return <SignUpScreen email={flow.email} onBack={back} onEmail={(email) => go("signUpPassword", email)} onSocial={(provider) => go("signUpSocial", undefined, provider)} onSignIn={() => go("signIn")} />;
      case "signUpPassword":
        return <PasswordScreen mode="signUp" email={flow.email} onBack={back} onDone={() => go("signUpCode")} />;
      case "signUpCode":
        return <CodeScreen mode="signUp" email={flow.email} onBack={back} onDone={() => go("leader")} />;
      case "signUpSocial":
        return <BrowserScreen provider={flow.provider ?? "google"} onBack={back} onDone={joined} />;
      case "leader":
        return (
          <LeaderScreen
            onDone={(created) => {
              setLeader(created);
              go("about");
            }}
          />
        );
      case "about":
        return (
          leader && (
            <AboutScreen
              leader={leader}
              onDone={(name, bio, codes) => {
                setAbout({ name, bio, codes });
                go("import");
              }}
            />
          )
        );
      case "import":
        return leader && <ImportScreen leader={leader} onDone={(memories) => onFinish({ kind: "joined", leader, myName: about.name, profile: { bio: about.bio, memories }, codes: about.codes })} />;
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pt-2 pb-8">
      {step && <StepIndicator index={step.index} />}
      {/* Keyed by screen, so each one enters fresh and slides in from the side it came from. */}
      <div key={flow.screen} className={cn("my-auto flex w-full justify-center", flow.direction === "back" ? "animate-enter-back" : "animate-enter")}>
        {screen()}
      </div>
    </div>
  );
}
