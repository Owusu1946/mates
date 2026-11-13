import type { WorkflowCard } from "@expojet/api-contract";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { haptic } from "../haptics";
import { useMateName } from "../mates/data";
import { useTheme } from "../theme/provider";
import { howText, STATUS_TEXT, useWatchControl, useWatches, type WatchAction } from "../watches/use-watches";
import { CardButton } from "./card-button";
import { ChatIcon } from "./chat-icon";

const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold" };

/**
 * A watch set up in chat: what it's watching for, how it's checked, the latest reading, and what
 * happens when it fires. Set like a reply, not a boxed card; kept current from the watches list.
 */
export function WatchCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const mateName = useMateName();
  const watches = useWatches();
  const control = useWatchControl();
  const watch = watches.data?.find((w) => w.watchId === state.watch?.watchId) ?? state.watch;
  const [busy, setBusy] = useState<WatchAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!watch) return null;
  const live = watch.status === "active" || watch.status === "paused";
  const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const act = async (action: WatchAction) => {
    setBusy(action);
    setError(null);
    try {
      await control(watch, action);
      haptic.success();
    } catch {
      setError("Couldn’t update this watch. Try again from Routines.");
      haptic.error();
    } finally {
      setBusy(null);
    }
  };
  const cancel = () =>
    Alert.alert("Stop watching?", `${mateName} will stop watching for “${watch.title}”.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Stop watching", style: "destructive", onPress: () => void act("cancel") },
    ]);

  return (
    <View testID="watch-card" style={{ gap: 8, paddingVertical: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <ChatIcon name="clock" color={watch.status === "active" ? colors.primary : colors.textMuted} size={15} />
        <Text style={{ color: colors.textMuted, fontFamily: font.medium, fontSize: 13 }}>
          {STATUS_TEXT[watch.status]}
          {live ? ` · ${howText(watch)}` : watch.firedAt ? ` · ${new Date(watch.firedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time(watch.firedAt)}` : ""}
        </Text>
      </View>
      <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 18 }}>{watch.title}</Text>
      <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 21 }}>{watch.condition}</Text>
      {watch.lastNote ? (
        <Text style={{ color: colors.text, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>
          {watch.status === "fired" ? "Triggered: " : "Now: "}
          {watch.lastNote}
          {watch.lastCheckedAt && watch.status !== "fired" ? <Text style={{ color: colors.textMuted }}>{` · ${time(watch.lastCheckedAt)}`}</Text> : null}
        </Text>
      ) : null}
      <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 13, lineHeight: 18 }}>Then: {watch.action}</Text>
      {error && <Text style={{ color: colors.error, fontSize: 13 }}>{error}</Text>}
      {(live || watch.status === "expired") && (
        <View style={{ flexDirection: "row", gap: 8, paddingTop: 4 }}>
          {watch.status === "active" && <CardButton label={busy === "pause" ? "Pausing…" : "Pause"} disabled={!!busy} onPress={() => void act("pause")} />}
          {watch.status === "paused" && <CardButton label={busy === "resume" ? "Resuming…" : "Resume"} disabled={!!busy} onPress={() => void act("resume")} />}
          {watch.status === "expired" && <CardButton label={busy === "renew" ? "Restarting…" : "Keep watching"} disabled={!!busy} onPress={() => void act("renew")} />}
          <CardButton label={busy === "cancel" ? "Stopping…" : "Stop"} variant="outlined" disabled={!!busy} onPress={cancel} />
        </View>
      )}
    </View>
  );
}
