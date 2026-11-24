import { useState } from "react";
import { crewFor, type Crew } from "./data/sampleCrew.ts";
import { Onboarding, type OnboardingResult } from "./onboarding/Onboarding.tsx";
import { AppLayout } from "./shell/AppLayout.tsx";
import { TitleBar } from "./shell/TitleBar.tsx";

/** A new member's crew is led by the mate they just made; someone signing back in gets the sample. */
const crewAfter = (result: OnboardingResult): Crew => (result.kind === "joined" ? crewFor(result.myName.trim() || "Ama", result.leader) : crewFor("Ama"));

export function App() {
  // UI only: signing in lasts until the window closes.
  const [crew, setCrew] = useState<Crew | null>(null);
  return (
    <div className="flex h-full flex-col">
      {crew ? (
        <AppLayout crew={crew} onSignOut={() => setCrew(null)} />
      ) : (
        <>
          <TitleBar />
          <Onboarding onFinish={(result) => setCrew(crewAfter(result))} />
        </>
      )}
    </div>
  );
}
