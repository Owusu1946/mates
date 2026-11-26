import { useAuth, useUser } from "@clerk/electron/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "./auth/AuthProvider.tsx";
import { useLeaderSetup } from "./auth/useLeaderSetup.ts";
import type { SampleProfile } from "./data/sampleCrew.ts";
import { useCrew } from "./remote/crew.ts";
import { DataProvider, useForgetData } from "./remote/DataProvider.tsx";
import { forgetSeen } from "./remote/seen.ts";
import { preferenceFromOnboarding } from "./settings/coding.logic.ts";
import { startCoding } from "./settings/coding.ts";
import { Onboarding } from "./onboarding/Onboarding.tsx";
import { AppLayout } from "./shell/AppLayout.tsx";
import { TitleBar } from "./shell/TitleBar.tsx";
import { WorkspaceLoading } from "./shell/WorkspaceLoading.tsx";

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
  const { isLoaded, isSignedIn, userId } = useAuth();
  // Clerk is reading the saved session: keep the empty window rather than flash the sign-in screen.
  if (!isLoaded) return <TitleBar />;
  if (!isSignedIn || !userId)
    return (
      <>
        <TitleBar />
        <Onboarding />
      </>
    );
  // Each account gets its own data and cache, so switching accounts never shows the last one's.
  return (
    <DataProvider key={userId} userId={userId}>
      <SignedIn userId={userId} />
    </DataProvider>
  );
}

/** What setup told us that the crew itself doesn't: the introduction to show in Memory. */
type Joined = { profile: SampleProfile };

function SignedIn({ userId }: { userId: string }) {
  const { signOut } = useAuth();
  const { user } = useUser();
  const forget = useForgetData();
  const client = useQueryClient();
  const setup = useLeaderSetup();
  const [joined, setJoined] = useState<Joined | null>(null);
  const you = user?.firstName || user?.primaryEmailAddress?.emailAddress.split("@")[0] || "there";
  // Signing out leaves nothing of this account on this device: its cache, then its session.
  const leave = async () => {
    await forget();
    forgetSeen(userId);
    await signOut();
  };

  if (joined || setup.status === "done") return <Workspace you={you} email={user?.primaryEmailAddress?.emailAddress} joined={joined} onSignOut={() => void leave()} />;
  return (
    <>
      <TitleBar />
      {setup.status === "needed" && (
        <Onboarding
          start="leader"
          onFinish={(result) => {
            startCoding(preferenceFromOnboarding(result.codes));
            // Setup saved the lead mate's name and look: load the crew fresh, not from an older copy.
            void client.invalidateQueries({ queryKey: ["mates"] });
            setJoined({ profile: result.profile });
          }}
        />
      )}
    </>
  );
}

/** Your crew from the API: the saved copy at once when there is one, the loading sidebar otherwise. */
function Workspace({ you, email, joined, onSignOut }: { you: string; email: string | undefined; joined: Joined | null; onSignOut: () => void }) {
  const live = useCrew();
  if (!live.crew) return <WorkspaceLoading error={live.error} onRetry={live.refresh} />;
  return <AppLayout you={you} email={email} crew={live.crew} unread={live.unread} onSeen={live.markSeen} profile={joined?.profile} hasProjects={joined ? false : undefined} onSignOut={onSignOut} />;
}
