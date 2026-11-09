import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { fetch } from "expo/fetch";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { enableNotifications } from "../data/notifications";

type PushTicket = { status?: string; id?: string; message?: string; details?: { error?: string } };
type PushResponse = { data?: PushTicket | PushTicket[]; errors?: { message?: string }[] };

const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;

export function DevNotificationPanel() {
  const { isLoaded, userId, getToken: getAuthToken } = useAuth();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState("Not checked");
  const [expoToken, setExpoToken] = useState<string | null>(null);
  const [message, setMessage] = useState("Open this panel to inspect notification permission and send test alerts.");

  if (!__DEV__ || Platform.OS === "web") return null;

  const requirePermission = async () => {
    let current = await Notifications.getPermissionsAsync();
    if (current.status !== "granted") current = await Notifications.requestPermissionsAsync();
    setPermission(current.status);
    if (current.status !== "granted") throw new Error("Allow notifications in system settings, then try again.");
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Cooper",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
  };

  const getExpoToken = async () => {
    if (!projectId) throw new Error("No EAS project ID is configured.");
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    setExpoToken(token);
    return token;
  };

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      setMessage(await action());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Notification test failed.");
    } finally {
      setBusy(false);
    }
  };

  const refreshStatus = () => run(async () => {
    const current = await Notifications.getPermissionsAsync();
    setPermission(current.status);
    if (current.status === "granted") await getExpoToken();
    return current.status === "granted" ? "Permission granted; Expo push token is ready." : `Notification permission: ${current.status}.`;
  });

  const registerDevice = () => run(async () => {
    if (!isLoaded || !userId) throw new Error("Sign in first to register this device with Mates.");
    const token = await enableNotifications(getAuthToken, userId);
    setExpoToken(token);
    setPermission("granted");
    return "Device registered with the Mates API. You can now test server-side delivery.";
  });

  const sendLocal = (seconds: number) => run(async () => {
    await requirePermission();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Mates notification test",
        body: seconds ? `Local notification scheduled for ${seconds} seconds from now.` : "Local notification received while the app is open.",
        data: { devNotificationTest: true },
        sound: "default",
      },
      trigger: seconds
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false }
        : null,
    });
    return seconds ? `Local notification scheduled for ${seconds} seconds.` : "Local notification sent.";
  });

  const sendExpoPush = () => run(async () => {
    await requirePermission();
    const token = expoToken ?? await getExpoToken();
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: token,
        title: "Mates push test",
        body: "This push came through the Expo Push Service.",
        data: { devNotificationTest: true },
        sound: "default",
        priority: "high",
      }),
    });
    const result = await response.json().catch(() => null) as PushResponse | null;
    const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data;
    if (!response.ok || ticket?.status !== "ok") {
      throw new Error(ticket?.message ?? result?.errors?.[0]?.message ?? `Expo push request failed (${response.status}).`);
    }
    return `Expo accepted the push${ticket.id ? ` · ticket ${ticket.id.slice(0, 8)}` : ""}. Check the device for delivery.`;
  });

  const bottom = Math.max(insets.bottom, 12) + 14;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {open && (
        <View style={[styles.panel, { bottom, right: 14 }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Notification tests</Text>
              <Text style={styles.subtitle}>DEV ONLY · {permission}{expoToken ? " · token ready" : ""}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close notification tools" onPress={() => setOpen(false)} style={styles.close}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.actions}>
            <Action label="Refresh permission / token" onPress={refreshStatus} disabled={busy} />
            <Action label="Register device with API" onPress={registerDevice} disabled={busy || !isLoaded || !userId} />
            <View style={styles.row}>
              <Action label="Local now" onPress={() => sendLocal(0)} disabled={busy} compact />
              <Action label="Local in 10s" onPress={() => sendLocal(10)} disabled={busy} compact />
            </View>
            <Action label="Send Expo push now" onPress={sendExpoPush} disabled={busy} primary />
          </View>

          <View style={styles.feedback}>
            {busy && <ActivityIndicator size="small" color="#a78bfa" />}
            <Text style={styles.feedbackText}>{message}</Text>
          </View>
          <Text style={styles.note}>Local tests check presentation. Expo push checks remote delivery. “Register device” prepares the API path.</Text>
        </View>
      )}

      {!open && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open dev notification tools"
          onPress={() => setOpen(true)}
          style={[styles.fab, { bottom, right: 16 }]}
        >
          <View style={styles.dot} />
          <Text style={styles.fabText}>DEV</Text>
        </Pressable>
      )}
    </View>
  );
}

function Action({ label, onPress, disabled, primary, compact }: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, primary && styles.primary, compact && styles.compact, (pressed || disabled) && styles.dimmed]}
    >
      <Text style={[styles.actionText, primary && styles.primaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    height: 42,
    minWidth: 72,
    borderRadius: 22,
    paddingHorizontal: 14,
    backgroundColor: "#18181b",
    borderColor: "#a78bfa",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#a78bfa" },
  fabText: { color: "#fafafa", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  panel: {
    position: "absolute",
    width: 320,
    maxWidth: "94%",
    padding: 16,
    borderRadius: 22,
    backgroundColor: "#18181b",
    borderColor: "#3f3f46",
    borderWidth: 1,
    gap: 13,
    elevation: 16,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#fafafa", fontSize: 16, fontWeight: "700" },
  subtitle: { color: "#a1a1aa", fontSize: 10, fontWeight: "600", marginTop: 3, letterSpacing: 0.6, textTransform: "uppercase" },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#27272a", alignItems: "center", justifyContent: "center" },
  closeText: { color: "#e4e4e7", fontSize: 22, lineHeight: 25 },
  actions: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  action: { minHeight: 40, flex: 1, borderRadius: 12, paddingHorizontal: 12, justifyContent: "center", alignItems: "center", backgroundColor: "#27272a" },
  compact: { minHeight: 38 },
  primary: { backgroundColor: "#7c3aed" },
  actionText: { color: "#f4f4f5", fontSize: 12, fontWeight: "600", textAlign: "center" },
  primaryText: { color: "#fff" },
  dimmed: { opacity: 0.55 },
  feedback: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, backgroundColor: "#27272a" },
  feedbackText: { flex: 1, color: "#d4d4d8", fontSize: 11, lineHeight: 16 },
  note: { color: "#71717a", fontSize: 10, lineHeight: 14 },
});
