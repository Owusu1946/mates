import { ClerkProvider, useAuth, useUser } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { env } from "../env";
import type { SessionState } from "./types";
import { disableNotifications } from "../data/notifications";
import { clearCache } from "../data/offline-cache";
import { identifyPurchases } from "../billing/purchases";

const SessionContext = createContext<SessionState | null>(null);
function ClerkSession({ children }: PropsWithChildren) {
  const auth = useAuth();
  const { user } = useUser();
  useEffect(() => {
    if (!auth.isLoaded) return;
    void identifyPurchases(auth.isSignedIn ? auth.userId : null).catch((error) => console.warn("purchase_identity_failed", error));
  }, [auth.isLoaded, auth.isSignedIn, auth.userId]);
  const value = useMemo<SessionState>(() => ({
    status: !auth.isLoaded ? "loading" : auth.isSignedIn ? "authenticated" : "unauthenticated",
    user: auth.isSignedIn && user ? { id: user.id, displayName: user.fullName ?? user.primaryEmailAddress?.emailAddress ?? undefined } : null,
    signIn: () => {},
    signOut: () => { void (async () => {
      // Invalidate the purchase identity before Clerk begins signing out.
      void identifyPurchases(null).catch((error) => console.warn("purchase_identity_failed", error));
      if (auth.userId) await disableNotifications(auth.getToken, auth.userId).catch(() => {});
      const userId = auth.userId;
      await auth.signOut();
      // Nothing of this account's chats stays on the device.
      if (userId) await clearCache(userId);
    })(); },
  }), [auth.isLoaded, auth.isSignedIn, auth.signOut, auth.getToken, auth.userId, user]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function ClerkMissingKeyNotice() {
  return (
    <View style={noticeStyles.container} testID="auth-screen">
      <Text style={noticeStyles.eyebrow}>MATES</Text>
      <Text style={noticeStyles.title}>Clerk Key Required</Text>
      <Text style={noticeStyles.body}>
        Please set <Text style={noticeStyles.code}>EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY</Text> in your <Text style={noticeStyles.code}>.env</Text> file to enable authentication.
      </Text>
    </View>
  );
}

export function SessionProvider({ children }: PropsWithChildren) {
  const publishableKey = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey || publishableKey === "pk_test_placeholder") {
    return (
      <SessionContext.Provider
        value={{
          status: "unauthenticated",
          user: null,
          signIn: () => {},
          signOut: () => {},
        }}
      >
        <ClerkMissingKeyNotice />
      </SessionContext.Provider>
    );
  }
  return <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}><ClerkSession>{children}</ClerkSession></ClerkProvider>;
}
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

const noticeStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24, backgroundColor: "#f4f6fb" },
  eyebrow: { color: "#315efb", fontWeight: "700", letterSpacing: 2 },
  title: { fontSize: 28, fontWeight: "800", color: "#0f172a", textAlign: "center" },
  body: { fontSize: 15, color: "#64748b", textAlign: "center", lineHeight: 22, maxWidth: 360 },
  code: { fontWeight: "700", color: "#0f172a" },
});
