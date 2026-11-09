import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useMateName } from "../mates/data";
import { useTheme } from "../theme/provider";
import { runRequest } from "./background-chat";
import { CardButton } from "./card-button";

type Routine = { id: string; version: number; status: string; nextRunAt: string | null };
type Action = "confirm" | "pause" | "resume" | "cancel";

const HEADINGS: Record<string, string> = { active: "Scheduled", paused: "Paused", cancelled: "Cancelled", finished: "Done", draft: "Schedule draft" };

/**
 * A routine set up in chat. It's active as soon as it's asked for, so the card reports it and
 * offers Pause and Cancel; older draft cards keep their Confirm button.
 */
export function ScheduleCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const { getToken, userId } = useAuth();
  const mateName = useMateName();
  const schedules = useQuery({ queryKey: ["routines", userId], queryFn: () => runRequest<{ routines: Routine[] }>(getToken, "schedules"), refetchInterval: 30_000 });
  const routine = schedules.data?.routines.find((item) => item.id === state.routineId);
  const status = routine?.status ?? (state.phase === "waiting" ? "draft" : "active");
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const zone = String(state.routineSpec?.timezone ?? "Africa/Accra");
  const nextRunAt = routine?.nextRunAt ?? state.nextRunAt;
  const next = nextRunAt ? new Date(nextRunAt).toLocaleString(undefined, { timeZone: zone, weekday: "short", hour: "numeric", minute: "2-digit" }) : null;

  const control = async (action: Action) => {
    const version = routine?.version ?? state.routineVersion;
    if (!state.routineId || !version) return;
    setBusy(action);
    setError(null);
    try {
      await runRequest(getToken, `schedules/${state.routineId}/control`, { action, version });
      await schedules.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t update this routine. Try again from Tasks.");
    } finally {
      setBusy(null);
    }
  };
  const cancel = () =>
    Alert.alert("Cancel this routine?", `${mateName} will stop doing “${state.label}”.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel routine", style: "destructive", onPress: () => void control("cancel") },
    ]);

  return (
    <View style={{ padding: 18, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 10 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{HEADINGS[status] ?? `Routine ${status}`}</Text>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>{state.label}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}>{state.detail}</Text>
      {next && (status === "active" || status === "draft") && <Text style={{ color: colors.text, fontSize: 14 }}>Next: {next}</Text>}
      {status === "active" && <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{mateName} runs it here and lets you know when it’s done.</Text>}
      {error && <Text style={{ color: colors.error, fontSize: 13 }}>{error}</Text>}
      {(status === "active" || status === "paused" || status === "draft") && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {status === "draft" && <CardButton label={busy === "confirm" ? "Confirming…" : "Confirm routine"} disabled={!!busy} onPress={() => void control("confirm")} />}
          {status === "active" && <CardButton label={busy === "pause" ? "Pausing…" : "Pause"} disabled={!!busy} onPress={() => void control("pause")} />}
          {status === "paused" && <CardButton label={busy === "resume" ? "Resuming…" : "Resume"} disabled={!!busy} onPress={() => void control("resume")} />}
          <CardButton label={busy === "cancel" ? "Cancelling…" : "Cancel"} variant="outlined" disabled={!!busy} onPress={cancel} />
        </View>
      )}
    </View>
  );
}
