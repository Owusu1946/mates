import { useAuth } from "@clerk/expo";
import { useAui } from "@assistant-ui/react-native";
import { CardButton } from "../chat/card-button";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  /** What the leader is doing right now (reviewing, planning), while no mate is working. */
  leaderStep?: string | null;
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

/** What the team is doing right now, in a few words. */
function statusOf(data: Mission, tasks: BoardTask[], working: BoardTask[]) {
  if (data.status === "needs_input") return `Needs you: ${data.question ?? "reply to continue"}`;
  if (data.status === "paused") return "Mission paused";
  if (data.status !== "running") return "Mission complete";
  if (working.length) return `${listNames([...new Set(working.map((t) => t.mate?.name).filter((n): n is string => !!n))])} working`;
  if (data.leaderStep) return data.leaderStep.replace(/…$/, "");
  return tasks.some((t) => t.status === "review") ? "Reviewing the team’s work" : "Lining up the next step";
}

/**
 * The mission above a group chat, as one line: who's working, what the team is doing, and
 * progress. Tapping it opens the full board in a bottom sheet.
 */
export function MissionBanner({ chatId }: { chatId: string }) {
  const { colors } = useTheme();
  const mission = useMission(chatId);
  const [open, setOpen] = useState(false);
  const data = mission.data;
  if (!data || data.status === "stopped") return null;
  const tasks = data.tasks ?? [];
  const working = tasks.filter((t) => t.status === "working");
  const done = tasks.filter((t) => t.status === "done").length;
  const status = statusOf(data, tasks, working);
  const urgent = data.status === "needs_input";

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Mission: ${status}${tasks.length ? `, ${done} of ${tasks.length} tasks done` : ""}. Opens the team board.`}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginHorizontal: 12,
          marginBottom: 6,
          paddingHorizontal: 12,
          height: 40,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: urgent ? colors.text : colors.border,
          backgroundColor: colors.surface,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {working.length > 0 && (
          <View style={{ flexDirection: "row" }}>
            {working.slice(0, 3).map((t, i) =>
              t.mate ? (
                <View key={t.id} style={{ marginLeft: i ? -6 : 0 }}>
                  <MateAvatar gradient={t.mate.gradient} shape={t.mate.shape} size={22} state="working" />
                </View>
              ) : null,
            )}
          </View>
        )}
        <Text numberOfLines={1} style={{ flex: 1, color: urgent ? colors.text : colors.textSecondary, fontSize: 14, fontFamily: urgent ? "DMSans_600SemiBold" : "DMSans_500Medium" }}>
          {status}
        </Text>
        {tasks.length > 0 && (
          <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_500Medium", fontVariant: ["tabular-nums"] }}>
            {done}/{tasks.length}
          </Text>
        )}
        <ChatIcon name="next" color={colors.textMuted} size={16} />
      </Pressable>
      <MissionSheet chatId={chatId} data={data} tasks={tasks} working={working} done={done} status={status} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** The team's live board: progress, every task with its owner, step and timer, and the controls. */
function MissionSheet({ chatId, data, tasks, working, done, status, visible, onClose }: { chatId: string; data: Mission; tasks: BoardTask[]; working: BoardTask[]; done: number; status: string; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const now = useNow(visible && working.length > 0);

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
  const openNotes = () => {
    onClose();
    router.push(`/mission/${encodeURIComponent(chatId)}` as never);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close the team board" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.35)" }]} />
      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View
          entering={SlideInDown.duration(240)}
          accessibilityViewIsModal
          style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderCurve: "continuous", paddingHorizontal: 18, paddingTop: 8, paddingBottom: insets.bottom + 12, gap: 12 }}
        >
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>MISSION · ROUND {data.round}</Text>
            <Text numberOfLines={3} style={{ color: colors.text, fontSize: 16, lineHeight: 22, fontFamily: "DMSans_600SemiBold" }}>
              {data.goal}
            </Text>
          </View>
          {tasks.length > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" }}>
                <View style={{ width: `${(done / tasks.length) * 100}%`, height: 4, borderRadius: 2, backgroundColor: colors.text }} />
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                {done}/{tasks.length} done
              </Text>
            </View>
          )}
          <Text style={{ color: data.status === "needs_input" ? colors.text : colors.textSecondary, fontSize: 14, lineHeight: 20, fontFamily: data.status === "needs_input" ? "DMSans_600SemiBold" : "DMSans_400Regular" }}>{status}</Text>

          {tasks.length > 0 ? (
            <ScrollView style={{ maxHeight: Math.round(height * 0.45) }} showsVerticalScrollIndicator={false}>
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} now={now} onPress={openNotes} />
              ))}
            </ScrollView>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 14, paddingVertical: 8 }}>The board fills in once the work is planned.</Text>
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
        </Animated.View>
      </View>
    </Modal>
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
