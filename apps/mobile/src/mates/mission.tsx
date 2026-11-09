import { useAuth } from "@clerk/expo";
import { useAui } from "@assistant-ui/react-native";
import { CardButton } from "../chat/card-button";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, LayoutAnimation, Pressable, ScrollView, Text, View } from "react-native";
import { runRequest } from "../chat/background-chat";
import { ChatIcon } from "../chat/chat-icon";
import { useTheme } from "../theme/provider";
import { MateAvatar } from "./mate-avatar";
import { StatusPill, type Status } from "./relay";

export type MissionNote = { id: string; title: string; version: number; author: string | null; updatedAt: string; content: string };
/** One task on the team's board: who owns it, where it is, what they're doing right now. */
export type BoardTask = {
  id: string;
  title: string;
  status: Status;
  mate: { id: string; name: string; color: string; shape?: string; gradient: [string, string, string] } | null;
  step: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  revisions: number;
};
export type Mission = {
  id: string;
  goal: string;
  status: "running" | "needs_input" | "paused" | "done" | "stopped";
  round: number;
  question: string | null;
  summary: string | null;
  working: string | null;
  workingTask: string | null;
  /** Older servers don't send the board. */
  tasks?: BoardTask[];
  notes: MissionNote[];
};

const ACTIVE = ["running", "needs_input"];

/** A group's latest mission: polled quickly while the team works, slowly while it waits on the user. */
export function useMission(chatId: string | undefined) {
  const { getToken, userId } = useAuth();
  return useQuery({
    queryKey: ["mission", userId, chatId],
    enabled: !!chatId,
    queryFn: async () => (await runRequest<{ mission: Mission | null }>(getToken, `missions?chatId=${encodeURIComponent(chatId!)}`)).mission,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 1_500 : query.state.data?.status === "needs_input" ? 5_000 : false),
  });
}

/** Ticks once a second while something on the board is running, for live timers. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

/** "Nova", "Nova and Sol", "Nova, Sol and Ivy". */
const listNames = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

function TaskRow({ task, now, onPress }: { task: BoardTask; now: number; onPress: () => void }) {
  const { colors } = useTheme();
  const working = task.status === "working";
  const time = working && task.startedAt ? clock(now - Date.parse(task.startedAt)) : task.status === "done" && task.startedAt && task.finishedAt ? clock(Date.parse(task.finishedAt) - Date.parse(task.startedAt)) : null;
  const detail = working ? task.step ?? "Getting started…" : task.status === "changes" ? `Revising after review${task.revisions > 1 ? ` (${task.revisions})` : ""}` : task.status === "review" ? "Waiting for review" : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${task.mate?.name ?? "unassigned"}, ${task.status}${time ? `, ${time}` : ""}`}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, opacity: pressed ? 0.6 : task.status === "queued" ? 0.6 : 1 })}
    >
      {task.mate ? <MateAvatar gradient={task.mate.gradient} shape={task.mate.shape} size={30} state={working ? "working" : "idle"} still={!working} /> : <View style={{ width: 30 }} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>
          {task.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
          {task.mate?.name ?? "Unassigned"}
          {detail ? ` · ${detail}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <StatusPill status={task.status} />
        {time && <Text style={{ color: colors.textMuted, fontSize: 11, fontVariant: ["tabular-nums"] }}>{time}</Text>}
      </View>
    </Pressable>
  );
}

/**
 * The team's live board above a group chat: progress, who's working on what right now with a
 * timer, what's in review or being revised, and the mission controls. Collapses to one line.
 */
export function MissionBanner({ chatId }: { chatId: string }) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const mission = useMission(chatId);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const data = mission.data;
  const tasks = data?.tasks ?? [];
  const working = tasks.filter((t) => t.status === "working");
  const now = useNow(open && working.length > 0);
  if (!data || data.status === "stopped") return null;

  const act = async (action: "pause" | "resume" | "stop") => {
    setBusy(true);
    try {
      await runRequest(getToken, `missions/${data.id}/${action}`, {});
      await client.invalidateQueries({ queryKey: ["mission"] });
    } catch (error) {
      Alert.alert("Couldn’t update the mission", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((value) => !value);
  };
  const done = tasks.filter((t) => t.status === "done").length;
  const workers = listNames([...new Set(working.map((t) => t.mate?.name).filter((n): n is string => !!n))]);
  const status =
    data.status === "running"
      ? working.length
        ? `${workers} ${working.length > 1 ? "are" : "is"} working · round ${data.round}`
        : tasks.some((t) => t.status === "review")
          ? `Reviewing the team’s work · round ${data.round}`
          : `Round ${data.round} · lining up the next step`
      : data.status === "needs_input"
        ? `Waiting for you: ${data.question ?? "reply to continue"}`
        : data.status === "paused"
          ? "Paused"
          : "Mission complete";
  const openNotes = () => router.push(`/mission/${encodeURIComponent(chatId)}` as never);

  return (
    <View style={{ marginHorizontal: 12, marginBottom: 6, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 8 }}>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Mission: ${data.goal}. ${status}`} style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>
            MISSION · {data.goal}
          </Text>
          {tasks.length > 0 && <Text style={{ color: colors.textMuted, fontSize: 12, fontVariant: ["tabular-nums"] }}>{done}/{tasks.length}</Text>}
          <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
            <ChatIcon name="next" color={colors.textMuted} size={16} />
          </View>
        </View>
        {tasks.length > 0 && (
          <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" }}>
            <View style={{ width: `${(done / tasks.length) * 100}%`, height: 3, borderRadius: 2, backgroundColor: colors.text }} />
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {!open && working.length > 0 && (
            <View style={{ flexDirection: "row" }}>
              {working.slice(0, 3).map((t, i) => (t.mate ? <View key={t.id} style={{ marginLeft: i ? -6 : 0 }}><MateAvatar gradient={t.mate.gradient} shape={t.mate.shape} size={22} state="working" /></View> : null))}
            </View>
          )}
          <Text numberOfLines={2} style={{ flex: 1, color: data.status === "needs_input" ? colors.text : colors.textSecondary, fontSize: 14, fontFamily: data.status === "needs_input" ? "DMSans_600SemiBold" : "DMSans_400Regular" }}>
            {status}
          </Text>
        </View>
      </Pressable>

      {open && tasks.length > 0 && (
        <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} now={now} onPress={openNotes} />
          ))}
        </ScrollView>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, marginLeft: -8 }}>
        <CardButton label={`Notes · ${data.notes.length}`} variant="text" onPress={openNotes} />
        {ACTIVE.includes(data.status) && <CardButton label="Pause" variant="text" disabled={busy} onPress={() => void act("pause")} />}
        {data.status === "paused" && <CardButton label="Resume" variant="text" disabled={busy} onPress={() => void act("resume")} />}
        {data.status !== "done" && (
          <CardButton
            label="Stop"
            variant="text"
            disabled={busy}
            onPress={() =>
              Alert.alert("Stop this mission?", "The team stops working. Notes and the conversation are kept.", [
                { text: "Cancel", style: "cancel" },
                { text: "Stop", style: "destructive", onPress: () => void act("stop") },
              ])
            }
          />
        )}
      </View>
    </View>
  );
}

/** "Team assembled": who the leader created, with a way into their group. */
export function TeamCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const aui = useAui();
  const team = state.team;
  if (!team) return null;
  return (
    <View style={{ padding: 16, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 12, marginVertical: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>TEAM ASSEMBLED</Text>
      <Text style={{ color: colors.text, fontSize: 17, fontFamily: "DMSans_600SemiBold" }}>{team.name}</Text>
      {team.members.map((member) => (
        <View key={member.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <MateAvatar gradient={member.gradient} shape={member.shape} size={34} still />
          <Text style={{ color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 15 }}>{member.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{member.role}</Text>
        </View>
      ))}
      <View style={{ alignSelf: "flex-start", marginLeft: -8 }}>
        <CardButton label={`Open ${team.name}`} variant="text" onPress={() => void aui.threads.switchToThread(team.chatId)} />
      </View>
    </View>
  );
}
