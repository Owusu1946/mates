import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme/provider";
import { runRequest } from "./background-chat";
import { CardButton } from "./card-button";

export function ScheduleCard({ state }: { state: WorkflowCard }) {
  const { colors, isDark } = useTheme();
  const { getToken, userId } = useAuth();
  const [status, setStatus] = useState("draft");
  const schedules = useQuery({ queryKey: ["routines", userId], queryFn: () => runRequest<{ routines: { id: string; version: number; status: string; nextRunAt: string | null }[] }>(getToken, "schedules"), refetchInterval: 10_000 });
  const routine = schedules.data?.routines.find(item => item.id === state.routineId);
  const currentStatus = routine?.status ?? status;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zone = String(state.routineSpec?.timezone ?? "Africa/Accra");
  const nextRunAt = routine?.nextRunAt ?? state.nextRunAt;
  const next = nextRunAt ? new Date(nextRunAt).toLocaleString(undefined, { timeZone: zone }) : "";
  return <View style={{ padding: 18, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 12 }}>
    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{currentStatus === "active" ? "Routine confirmed" : currentStatus === "draft" ? "Schedule draft" : `Routine ${currentStatus}`}</Text>
    <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>{state.label}</Text>
    <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}>{state.detail}</Text>
    <Text style={{ color: colors.text, fontSize: 14 }}>Next: {next} · {zone}</Text>
    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Results arrive in Cooper. External changes still need your approval.</Text>
    {error && <Text style={{ color: colors.error }}>{error}</Text>}
    {currentStatus === "draft" && <CardButton label={busy ? "Confirming…" : "Confirm routine"} disabled={busy || (routine && routine.version !== state.routineVersion)} onPress={async () => {
      if (!state.routineId || !state.routineVersion) return;
      setBusy(true); setError(null);
      try { await runRequest(getToken, `schedules/${state.routineId}/control`, { action: "confirm", version: state.routineVersion }); setStatus("active"); await schedules.refetch(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t confirm. Open Tasks to refresh the draft."); }
      finally { setBusy(false); }
    }} />}
    {routine && routine.version !== state.routineVersion && currentStatus === "draft" && <Text style={{ color: colors.textSecondary, fontSize: 13 }}>This draft was edited. Open Tasks to review and confirm its latest details.</Text>}
  </View>;
}
