import * as Notifications from "expo-notifications";
import { fetch } from "expo/fetch";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { getDevicePushToken, requestNotificationPermission } from "../data/notifications";

type PushTicket = { status?: string; id?: string; message?: string; details?: { error?: string } };
type PushResponse = { data?: PushTicket | PushTicket[]; errors?: { message?: string }[] };
type SampleKind = "ready" | "attention" | "running" | "background";

const sampleNotifications: Record<SampleKind, { title: string; body: string; kind: string }> = {
  ready: { title: "Your app is ready ✨", body: "The onboarding refresh is complete. Want me to make a PR?", kind: "result-ready" },
  attention: { title: "Kojo needs one detail", body: "Which repo should I use: mates-mobile or mates-app?", kind: "needs-attention" },
  running: { title: "Kojo is on it", body: "Onboarding is updated. I’m running the final checks now.", kind: "task-running" },
  background: { title: "Your task finished", body: "The app is ready to review. Want me to make a PR?", kind: "background-result" },
};

export function DevPanel() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expoToken, setExpoToken] = useState<string | null>(null);
  const [message, setMessage] = useState("Choose a sample to preview a task or test a notification.");

  if (!__DEV__ || Platform.OS === "web") return null;

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

  const sendLocal = (seconds: number, kind: SampleKind) => run(async () => {
    await requestNotificationPermission();
    const sample = sampleNotifications[kind];
    await Notifications.scheduleNotificationAsync({
      content: {
        title: sample.title,
        body: sample.body,
        data: { devNotificationTest: sample.kind },
        sound: "default",
      },
      trigger: seconds
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false }
        : null,
    });
    return seconds ? `“${sample.title}” scheduled as a notification for ${seconds} seconds.` : `“${sample.title}” sent as a local notification.`;
  });

  const sendExpoPush = (kind: SampleKind) => run(async () => {
    const token = expoToken ?? await getDevicePushToken();
    setExpoToken(token);
    const sample = sampleNotifications[kind];
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: token,
        title: sample.title,
        body: sample.body,
        data: { devNotificationTest: sample.kind },
        sound: "default",
        priority: "high",
      }),
    });
    const result = await response.json().catch(() => null) as PushResponse | null;
    const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data;
    if (!response.ok || ticket?.status !== "ok") {
      throw new Error(ticket?.message ?? result?.errors?.[0]?.message ?? `Expo push request failed (${response.status}).`);
    }
    return `Expo accepted the sample ${sample.kind} push${ticket.id ? ` · ticket ${ticket.id.slice(0, 8)}` : ""}.`;
  });

  const bottom = Math.max(insets.bottom, 12) + 14 + height * 0.15;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {open && (
        <View style={[styles.panel, { bottom, right: 14 }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Dev Tools</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close notification tools" onPress={() => setOpen(false)} style={styles.close}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.actions}>
            <View style={styles.row}>
              <Action label="Result ready" onPress={() => sendLocal(0, "ready")} disabled={busy} compact />
              <Action label="Needs attention" onPress={() => sendLocal(0, "attention")} disabled={busy} compact />
            </View>
            <View style={styles.row}>
              <Action label="Running update" onPress={() => sendLocal(0, "running")} disabled={busy} compact />
              <Action label="Background result · 15s" onPress={() => sendLocal(15, "background")} disabled={busy} compact />
            </View>
            <View style={styles.row}>
              <Action label="Push notification" onPress={() => sendExpoPush("ready")} disabled={busy} compact />
            </View>
          </View>

          <View style={styles.feedback}>
            {busy && <ActivityIndicator size="small" color="#a78bfa" />}
            <Text style={styles.feedbackText}>{message}</Text>
          </View>
          {/* <Text style={styles.note}>Each sample arrives as a device notification. Push notification sends through Expo.</Text> */}
        </View>
      )}

      {!open && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open dev notification tools"
          onPress={() => setOpen(true)}
          style={[styles.fab, { bottom, right: 16 }]}
        >
          <Text style={styles.fabText}>DEV</Text>
        </Pressable>
      )}
    </View>
  );
}

function Action({ label, onPress, disabled, compact }: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, compact && styles.compact, (pressed || disabled) && styles.dimmed]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    height: 25,
    minWidth: 45,
    borderRadius: 7,
    paddingHorizontal: 8,
    backgroundColor: "rgba(24,24,27,0.58)",
    borderColor: "rgba(255,255,255,0.34)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fabText: { color: "#fafafa", fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  panel: {
    position: "absolute",
    width: 320,
    maxWidth: "94%",
    padding: 16,
    borderRadius: 10,
    backgroundColor: "rgba(24,24,27,0.9)",
    borderColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    gap: 10,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#fafafa", fontSize: 16, fontWeight: "700" },
  subtitle: { color: "#a1a1aa", fontSize: 10, fontWeight: "600", marginTop: 3, letterSpacing: 0.6, textTransform: "uppercase" },
  close: { width: 30, height: 30, borderRadius: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  closeText: { color: "#e4e4e7", fontSize: 22, lineHeight: 25 },
  actions: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  action: { minHeight: 38, flex: 1, borderRadius: 7, paddingHorizontal: 8, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  compact: { minHeight: 36 },
  actionText: { color: "#f4f4f5", fontSize: 11, fontWeight: "500", textAlign: "center" },
  dimmed: { opacity: 0.55 },
  feedback: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, paddingHorizontal: 9, borderRadius: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  feedbackText: { flex: 1, color: "#d4d4d8", fontSize: 11, lineHeight: 16 },
  note: { color: "#71717a", fontSize: 10, lineHeight: 14 },
});
