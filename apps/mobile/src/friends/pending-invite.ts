import { useAuth } from "@clerk/expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { useEffect } from "react";

/**
 * An invite link opened before signing in (or before signing up) would be lost at the sign-in
 * screen. It's kept here and opened once the person is in.
 */
const KEY = "cooper:pending-invite";

/** The invite code in a mates://connect?c= or https://…/connect?c= link, if it is one. */
export function inviteCodeIn(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const path = `${parsed.host}${parsed.pathname}`.replace(/\/+$/, "");
    if (!path.endsWith("connect")) return null;
    const code = parsed.searchParams.get("c");
    return code && /^[a-z0-9]{6,20}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

/** Mounted at the root: remembers an invite link that arrives while signed out. */
export function InviteCapture() {
  const url = Linking.useURL();
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    const code = inviteCodeIn(url);
    if (code && isLoaded && !isSignedIn) void AsyncStorage.setItem(KEY, code).catch(() => undefined);
  }, [url, isLoaded, isSignedIn]);
  return null;
}

/** The remembered invite, once; null if there's none. */
export async function takePendingInvite(): Promise<string | null> {
  try {
    const code = await AsyncStorage.getItem(KEY);
    if (code) await AsyncStorage.removeItem(KEY);
    return code;
  } catch {
    return null;
  }
}
