import { useLeaderName } from "../../src/mates/data";
import { useAuth } from "@clerk/expo";
import { Button, Host } from "@expo/ui";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { createApiClient } from "../../src/data/api";
import { runRequest } from "../../src/chat/background-chat";
import { RoutineForm, type RoutineSpec } from "../../src/components/routine-form";
import { useTheme } from "../../src/theme/provider";

type Routine = { id: string; title: string; spec: RoutineSpec; version: number; status: string; nextRunAt: string | null };
export default function TasksScreen() {
  const { getToken, userId } = useAuth();
  const { colors, isDark } = useTheme();
  const leaderName = useLeaderName();
  const router = useRouter();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const [editing, setEditing] = useState<Routine | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runKeys = useRef(new Map<string, string>());
  const [history, setHistory] = useState<{ id: string; status: string; scheduledFor: string; error: string | null }[] | null>(null);
  const schedules = useQuery({ queryKey: ["routines", userId], queryFn: () => runRequest<{ routines: Routine[] }>(getToken, "schedules"), refetchInterval: 10_000 });
  const reminders = useQuery({ queryKey: ["reminders", userId], queryFn: () => runRequest<{ reminders: { id: string; title: string; body: string | null; remindAt: string }[] }>(getToken, "reminders"), refetchInterval: 30_000 });
  useFocusEffect(useCallback(() => { void schedules.refetch(); void reminders.refetch(); }, [schedules.refetch, reminders.refetch]));
  const act = async (item: Routine, action: "confirm" | "pause" | "resume" | "cancel" | "run" | "history") => {
    setBusy(item.id); setError(null);
    try {
      if (action === "history") setHistory((await runRequest<{ runs: NonNullable<typeof history> }>(getToken, `schedules/${item.id}/runs`)).runs);
      else if (action === "run") {
        const requestKey = runKeys.current.get(item.id) ?? randomUUID();
        runKeys.current.set(item.id, requestKey);
        const { run } = await runRequest<{ run: { id: string } }>(getToken, `schedules/${item.id}/run`, { requestKey });
        runKeys.current.delete(item.id);
        router.push({ pathname: "/(app)/feed", params: { runId: run.id } });
      } else await runRequest(getToken, `schedules/${item.id}/control`, { action, version: item.version });
      await schedules.refetch();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t update routine."); }
    finally { setBusy(null); }
  };
  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={schedules.isFetching} onRefresh={() => void schedules.refetch()} />}>
    <Text style={{ color: colors.text, fontSize: 30, fontWeight: "700" }}>Your routines</Text>
    <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Give your mates work to do later—even while you’re away.</Text>
    {!!reminders.data?.reminders.length && <View style={{ gap: 10 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>Upcoming reminders</Text>
      {reminders.data.reminders.map(reminder => <View key={reminder.id} style={{ padding: 16, gap: 6, borderRadius: 18, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>{reminder.title}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{new Date(reminder.remindAt).toLocaleString()}{reminder.body ? ` · ${reminder.body}` : ""}</Text>
        <Host matchContents colorScheme={isDark ? "dark" : "light"}><Button label="Cancel reminder" variant="text" onPress={async () => {
          try { await runRequest(getToken, `reminders/${reminder.id}/cancel`, {}); await reminders.refetch(); }
          catch { setError("Couldn’t cancel the reminder."); }
        }} /></Host>
      </View>)}
    </View>}
    {error && <Text style={{ color: colors.error }}>{error}</Text>}
    {schedules.isError && <Text style={{ color: colors.error }}>Couldn’t refresh your routines. Pull down to retry.</Text>}
    {!editing && <Host matchContents colorScheme={isDark ? "dark" : "light"}><Button label="New routine" onPress={() => setEditing("new")} /></Host>}
    {editing && <RoutineForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing.spec} onCancel={() => setEditing(null)} onSave={async spec => {
      if (editing === "new") await runRequest(getToken, "schedules/draft", spec);
      else {
        const response = await api.v1.schedules[":id"].$patch({ param: { id: editing.id }, json: { spec, version: editing.version } });
        if (!response.ok) throw new Error("Couldn’t edit. Refresh to check the current version.");
      }
      setEditing(null); await schedules.refetch();
    }} />}
    {schedules.isLoading && <Text style={{ color: colors.textSecondary }}>Loading routines…</Text>}
    {schedules.data?.routines.length === 0 && <Text style={{ color: colors.textSecondary, paddingVertical: 32 }}>Nothing scheduled yet. Create a routine or ask {leaderName} to draft one in chat.</Text>}
    {schedules.data?.routines.map(item => <View key={item.id} style={{ padding: 18, gap: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.status.toUpperCase()} · {item.spec.frequency}</Text>
      <Text style={{ color: colors.text, fontSize: 19, fontWeight: "600" }}>{item.title}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>{item.spec.prompt}</Text>
      <Text style={{ color: colors.text, fontSize: 13 }}>{item.nextRunAt && !["cancelled", "finished"].includes(item.status) ? `Next: ${new Date(item.nextRunAt).toLocaleString(undefined, { timeZone: item.spec.timezone })}` : "No upcoming run"} · {item.spec.timezone}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{(item.status === "draft" ? ["confirm", "cancel"] : item.status === "active" ? ["pause", "run", "cancel"] : item.status === "paused" ? ["resume", "run", "cancel"] : []).map(action => <Host key={action} matchContents colorScheme={isDark ? "dark" : "light"}><Button label={action === "run" ? "Run now" : action[0]!.toUpperCase() + action.slice(1)} variant="outlined" disabled={!!busy} onPress={() => void act(item, action as "confirm" | "pause" | "resume" | "cancel" | "run")} /></Host>)}</View>
      <View style={{ flexDirection: "row", gap: 12 }}><Host matchContents colorScheme={isDark ? "dark" : "light"}><Button label="History" variant="text" disabled={!!busy} onPress={() => void act(item, "history")} /></Host>{!["cancelled", "finished"].includes(item.status) && <Host matchContents colorScheme={isDark ? "dark" : "light"}><Button label="Edit" variant="text" disabled={!!busy} onPress={() => setEditing(item)} /></Host>}</View>
    </View>)}
    {history && <View style={{ gap: 12 }}><Text style={{ color: colors.text, fontWeight: "600" }}>Run history</Text>{history.length ? history.map(run => <Host key={run.id} matchContents colorScheme={isDark ? "dark" : "light"}><Button label={`${new Date(run.scheduledFor).toLocaleString()} · ${run.status}`} variant="text" onPress={() => router.push({ pathname: "/(app)/feed", params: { runId: run.id } })} /></Host>) : <Text style={{ color: colors.textSecondary }}>This routine hasn’t run yet.</Text>}</View>}
  </ScrollView>;
}
