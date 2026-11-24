import { useEffect, useReducer, useState } from "react";
import { AboutScreen } from "./AboutScreen.tsx";
import { ChooseScreen } from "./ChooseScreen.tsx";
import { CodeScreen } from "./CodeScreen.tsx";
import { ImportScreen } from "./ImportScreen.tsx";
import { LeaderScreen, type Leader } from "./LeaderScreen.tsx";
import { INITIAL_FLOW, flowReducer, newcomerStep, type Screen } from "./OnboardingFlow.logic.ts";
import { PasswordScreen } from "./PasswordScreen.tsx";
import { SignInScreen } from "./SignInScreen.tsx";
import { SignUpScreen } from "./SignUpScreen.tsx";
import { StepIndicator } from "./StepIndicator.tsx";
import { cn } from "../lib/utils.ts";

export type OnboardingResult = { kind: "signedIn" } | { kind: "joined"; leader: Leader; myName: string };

/**
 * Getting in, from the first screen to the app. UI only for now: nothing signs in or saves yet,
 * and Apple and Google do nothing. The screens and their order are the real ones.
 */
export function Onboarding({ onFinish }: { onFinish: (result: OnboardingResult) => void }) {
  const [flow, dispatch] = useReducer(flowReducer, INITIAL_FLOW);
  const [leader, setLeader] = useState<Leader | null>(null);
  const [myName, setMyName] = useState("");
  const step = newcomerStep(flow.screen);

  const go = (to: Screen, email?: string) => dispatch({ type: "go", to, email });
  const back = () => dispatch({ type: "back" });

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
        return <SignInScreen email={flow.email} onBack={back} onEmail={(email) => go("signInPassword", email)} onCreateAccount={() => go("signUp")} />;
      case "signInPassword":
        return <PasswordScreen mode="signIn" email={flow.email} onBack={back} onDone={() => onFinish({ kind: "signedIn" })} onUseCode={() => go("signInCode")} />;
      case "signInCode":
        return <CodeScreen mode="signIn" email={flow.email} onBack={back} onDone={() => onFinish({ kind: "signedIn" })} />;
      case "signUp":
        return <SignUpScreen email={flow.email} onBack={back} onEmail={(email) => go("signUpPassword", email)} onSignIn={() => go("signIn")} />;
      case "signUpPassword":
        return <PasswordScreen mode="signUp" email={flow.email} onBack={back} onDone={() => go("signUpCode")} />;
      case "signUpCode":
        return <CodeScreen mode="signUp" email={flow.email} onBack={back} onDone={() => go("leader")} />;
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
              onDone={(name) => {
                setMyName(name);
                go("import");
              }}
            />
          )
        );
      case "import":
        return leader && <ImportScreen leader={leader} onDone={() => onFinish({ kind: "joined", leader, myName })} />;
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
