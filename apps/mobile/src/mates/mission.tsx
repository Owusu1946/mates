import { useAuth } from "@clerk/expo";
import { useAui } from "@assistant-ui/react-native";
import { CardButton } from "../chat/card-button";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { runRequest } from "../chat/background-chat";
import { useTheme } from "../theme/provider";
import { MateAvatar } from "./mate-avatar";

export type MissionNote = { id: string; title: string; version: number; author: string | null; updatedAt: string; content: string };
export type Mission = {
  id: string;
  goal: string;
  status: "running" | "needs_input" | "paused" | "done" | "stopped";
  round: number;
  question: string | null;
  summary: string | null;
  working: string | null;
  workingTask: string | null;
  notes: MissionNote[];
};

const ACTIVE = ["running", "needs_input"];

/** A group's latest mission; polls while the team is working or waiting on the user. */
export function useMission(chatId: string | undefined) {
  const { getToken, userId } = useAuth();
  return useQuery({
    queryKey: ["mission", userId, chatId],
    enabled: !!chatId,
    queryFn: async () => (await runRequest<{ mission: Mission | null }>(getToken, `missions?chatId=${encodeURIComponent(chatId!)}`)).mission,
    refetchInterval: (query) => (query.state.data && ACTIVE.includes(query.state.data.status) ? 4_000 : false),
  });
}

/** The mission at a glance above a group chat: who's working, what it needs, and controls. */
export function MissionBanner({ chatId }: { chatId: string }) {
  const { colors, isDark } = useTheme();
  const { getToken } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const mission = useMission(chatId);
  const [busy, setBusy] = useState(false);
  const data = mission.data;
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
  const status =
    data.status === "running"
      ? data.working
        ? `${data.working} is working${data.workingTask ? `: ${data.workingTask}` : "…"} · round ${data.round}`
        : `Round ${data.round} · the team is lining up the next step`
      : data.status === "needs_input"
        ? `Waiting for you: ${data.question ?? "reply to continue"}`
        : data.status === "paused"
          ? "Paused"
          : "Mission complete";

  return (
    <View style={{ marginHorizontal: 12, marginBottom: 6, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 6 }}>
      <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>MISSION · {data.goal}</Text>
      <Text numberOfLines={2} style={{ color: data.status === "needs_input" ? colors.text : colors.textSecondary, fontSize: 14, fontFamily: data.status === "needs_input" ? "DMSans_600SemiBold" : "DMSans_400Regular" }}>
        {status}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, marginLeft: -8 }}>
        <CardButton label={`Notes · ${data.notes.length}`} variant="text" onPress={() => router.push(`/mission/${encodeURIComponent(chatId)}` as never)} />
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
  const { colors, isDark } = useTheme();
  const aui = useAui();
  const team = state.team;
  if (!team) return null;
  return (
    <View style={{ padding: 16, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 12, marginVertical: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>TEAM ASSEMBLED</Text>
      <Text style={{ color: colors.text, fontSize: 17, fontFamily: "DMSans_600SemiBold" }}>{team.name}</Text>
      {team.members.map((member) => (
        <View key={member.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <MateAvatar gradient={member.gradient} size={34} still />
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
