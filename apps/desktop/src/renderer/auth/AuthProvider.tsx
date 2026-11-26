import { ClerkProvider } from "@clerk/electron/react";
import type { ReactNode } from "react";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/** No router here: our own screens move on when the session changes, so Clerk never navigates. */
const stay = () => undefined;

/**
 * The same Mates account as the phone, through Clerk (desktop-app.md, Signing in). The session
 * token lives in the main process, encrypted, so a relaunch stays signed in.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!publishableKey)
    return (
      <div className="m-auto max-w-sm p-6 text-center text-sm text-ink-soft">
        Set VITE_CLERK_PUBLISHABLE_KEY in apps/desktop/.env to sign in (see .env.example).
      </div>
    );
  return (
    <ClerkProvider publishableKey={publishableKey} routerPush={stay} routerReplace={stay}>
      {children}
    </ClerkProvider>
  );
}
