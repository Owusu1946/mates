import { useAuth, useUser } from "@clerk/electron/react";
import { useState } from "react";
import { AuthProvider } from "./auth/AuthProvider.tsx";
import { useLeaderSetup } from "./auth/useLeaderSetup.ts";
import { crewFor, type Crew } from "./data/sampleCrew.ts";
import { preferenceFromOnboarding } from "./settings/coding.logic.ts";
import { startCoding } from "./settings/coding.ts";
import { Onboarding, type OnboardingResult } from "./onboarding/Onboarding.tsx";
import { AppLayout } from "./shell/AppLayout.tsx";
import { TitleBar } from "./shell/TitleBar.tsx";

/**
 * A new member's crew is led by the mate they just made, with no projects yet; someone signing back
 * in gets the sample workspace, projects included. Onboarding's coding answer sets the preference.
 * Only who you are is real so far: the crew, chats and projects are still the sample's.
 */
function crewAfter(you: string, result: OnboardingResult): Crew {
  if (result.kind === "signedIn") return crewFor(you);
  startCoding(preferenceFromOnboarding(result.codes));
  return { ...crewFor(result.myName.trim() || you, result.leader), profile: result.profile, hasProjects: false };
}

export function App() {
  return (
    <div className="flex h-full flex-col">
      <AuthProvider>
        <Session />
      </AuthProvider>
    </div>
  );
}

/** Signed out: the ways in. Signed in: setting up the lead mate if it isn't yet, then the app. */
function Session() {
  const { isLoaded, isSignedIn } = useAuth();
  // Clerk is reading the saved session: keep the empty window rather than flash the sign-in screen.
  if (!isLoaded) return <TitleBar />;
  if (!isSignedIn)
    return (
      <>
        <TitleBar />
        <Onboarding onFinish={() => undefined} />
      </>
    );
  return <SignedIn />;
}

function SignedIn() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const setup = useLeaderSetup();
  const [crew, setCrew] = useState<Crew | null>(null);
  const you = user?.firstName || user?.primaryEmailAddress?.emailAddress.split("@")[0] || "there";

  if (crew || setup.status === "done") return <AppLayout crew={crew ?? crewFor(you)} onSignOut={() => void signOut()} />;
  return (
    <>
      <TitleBar />
      {setup.status === "needed" && <Onboarding start="leader" onFinish={(result) => setCrew(crewAfter(you, result))} />}
    </>
  );
}
