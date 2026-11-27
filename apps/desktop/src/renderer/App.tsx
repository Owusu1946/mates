import { useAuth as useClerkAuth, useUser } from "@clerk/electron/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { forgetAccount, OfflineAccountContext, saveAccount, savedAccount, useAuth, useOnline } from "./auth/account.ts";
import { AuthProvider } from "./auth/AuthProvider.tsx";
import { useLeaderSetup } from "./auth/useLeaderSetup.ts";
import type { SampleProfile } from "./data/sampleCrew.ts";
import { useCrew } from "./remote/crew.ts";
import { DataProvider, useForgetData } from "./remote/DataProvider.tsx";
import { forgetMessagePins } from "./remote/messagePins.ts";
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

/**
 * Signed out: the ways in. Signed in: setting up the lead mate if it isn't yet, then the app.
 * Until Clerk has loaded (slow, or offline, where it never does), the account last signed in here
 * opens from its saved copy (auth/account.ts), as T3 Code opens without a connection; once Clerk
 * says who you are, that's who it is.
 */
function Session() {
  const { isLoaded, isSignedIn, userId } = useClerkAuth();
  const online = useOnline();
  const saved = isLoaded ? null : savedAccount();
  const account = isLoaded ? (isSignedIn ? userId : null) : (saved?.id ?? null);
  // Clerk's script fails when it starts offline and doesn't try again: once back online, start again
  // (from the saved copy, so nothing blinks). Only then: a slow start online just waits.
  const [missedClerk, setMissedClerk] = useState(false);
  if (!online && !isLoaded && !missedClerk) setMissedClerk(true);
  useEffect(() => {
    if (!online || isLoaded || !missedClerk) return;
    const timer = setTimeout(() => window.location.reload(), 1500);
    return () => clearTimeout(timer);
  }, [online, isLoaded, missedClerk]);
  if (!account) {
    if (!isLoaded)
      return (
        <>
          <TitleBar />
          {!online && <p className="m-auto text-sm text-ink-soft">You’re offline. Connect to the internet to sign in.</p>}
        </>
      );
    return (
      <>
        <TitleBar />
        <Onboarding />
      </>
    );
  }
  // Each account gets its own data and cache, so switching accounts never shows the last one's.
  return (
    <OfflineAccountContext value={isLoaded ? null : account}>
      <DataProvider key={account} userId={account}>
        <SignedIn userId={account} />
      </DataProvider>
    </OfflineAccountContext>
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
  const saved = savedAccount();
  const email = user?.primaryEmailAddress?.emailAddress ?? (saved?.id === userId ? saved.email : undefined);
  const you = user?.firstName || user?.primaryEmailAddress?.emailAddress.split("@")[0] || (saved?.id === userId ? saved.name : "") || "there";
  // Kept so the next launch can open without a connection.
  useEffect(() => {
    if (user) saveAccount({ id: userId, name: you, ...(email ? { email } : {}) });
  }, [user, userId, you, email]);
  // Signing out leaves nothing of this account on this device: its cache, then its session.
  const leave = async () => {
    await forget();
    forgetAccount();
    forgetSeen(userId);
    forgetMessagePins(userId);
    await signOut();
  };

  if (joined || setup.status === "done") return <Workspace you={you} email={email} joined={joined} onSignOut={() => void leave()} />;
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
  const online = useOnline();
  if (!live.crew) return <WorkspaceLoading error={online ? live.error : "You’re offline, and this account has nothing saved here yet."} onRetry={live.refresh} />;
  return (
    <>
      {!online && (
        <p role="status" className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-line bg-raised px-3 py-1 text-xs text-ink-soft shadow-md">
          Offline · showing what’s saved. Sending waits until you’re back.
        </p>
      )}
      <AppLayout you={you} email={email} crew={live.crew} unread={live.unread} onSeen={live.markSeen} profile={joined?.profile} hasProjects={joined ? false : undefined} onSignOut={onSignOut} />
    </>
  );
}
