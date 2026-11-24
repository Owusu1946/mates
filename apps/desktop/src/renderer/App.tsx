import { useState } from "react";
import { crewFor, type Crew } from "./data/sampleCrew.ts";
import { preferenceFromOnboarding } from "./settings/coding.logic.ts";
import { startCoding } from "./settings/coding.ts";
import { Onboarding, type OnboardingResult } from "./onboarding/Onboarding.tsx";
import { AppLayout } from "./shell/AppLayout.tsx";
import { TitleBar } from "./shell/TitleBar.tsx";

/**
 * A new member's crew is led by the mate they just made, with no projects yet; someone signing back
 * in gets the sample workspace, projects included. Onboarding's coding answer sets the preference.
 */
function crewAfter(result: OnboardingResult): Crew {
  if (result.kind === "signedIn") return crewFor("Ama");
  startCoding(preferenceFromOnboarding(result.codes));
  return { ...crewFor(result.myName.trim() || "Ama", result.leader), profile: result.profile, hasProjects: false };
}

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
