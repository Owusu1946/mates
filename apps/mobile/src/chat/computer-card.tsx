import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsFocused, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, Pressable, Text, TextInput, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { LiveView } from "../computer/live-view";
import { useComputer, type ComputerStatus } from "../computer/use-computer";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import { runRequest } from "./background-chat";
import { CardButton } from "./card-button";
import { computerOutcome } from "./task-outcome";
import { ShimmerText } from "./shimmer-text";

const ACTIVE = ["queued", "running", "waiting"];

/**
 * A goal on the mates' computer, kept live by polling. A shimmer line says what it's doing; while it
 * runs, a small live view shows the desktop with Take over and Stop. When it needs you (an OK, a
 * sign-in, a question) the card asks right here. When it ends, it shows the receipt and evidence.
 */
export function ComputerCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Hidden under the full-screen computer (or another screen), the card drops its stream: one
  // viewer at a time, and only a visible stream counts as watching.
  const focused = useIsFocused();
  const initial = state.computer;
  const cached = client.getQueryData<ComputerStatus>(["computer", userId]);
  const computer = useComputer({ watching: focused && !!cached?.available && cached.goal?.id === initial?.goalId });
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const live = useQuery({
    queryKey: ["computer-goal", userId, initial?.goalId],
    enabled: !!initial,
    initialData: state,
    queryFn: async () => (await runRequest<{ card: WorkflowCard }>(getToken, `computer/goals/${initial!.goalId}`)).card,
    refetchInterval: (query) => (ACTIVE.includes(query.state.data?.computer?.status ?? "done") ? 2_000 : false),
    // A finished goal never changes, so a card scrolled back into view doesn't fetch it again.
    staleTime: (query) => (ACTIVE.includes(query.state.data?.computer?.status ?? "done") ? 0 : Infinity),
  });
  const card = live.data ?? state;
  const goal = card.computer ?? initial;
  if (!goal) return null;
  const outcome = computerOutcome(goal);
  const active = ACTIVE.includes(goal.status);
  // This card's goal is the one on the computer right now, so its live view is this task's.
  const onScreen = active && focused && computer.view?.state === "on" && computer.view.goal?.id === goal.goalId;
  const liveHeight = Math.round(((width - 48) * 3) / 4 * 0.55);
  const lineStyle = { fontFamily: "DMSans_500Medium", fontSize: 14.5, letterSpacing: 0.1 } as const;

  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ["computer-goal", userId, goal.goalId] }), computer.refresh()]);
  const post = async (path: string, body: unknown) => {
    setBusy(true);
    try {
      await runRequest(getToken, path, body);
      await refresh();
    } catch (error) {
      Alert.alert("Couldn’t do that", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };
  const answer = (choice: "approve" | "decline" | "continue") => { haptic.light(); void post(`computer/goals/${goal.goalId}/reply`, { choice }); };
  const send = () => { if (!reply.trim()) return; haptic.light(); void post(`computer/goals/${goal.goalId}/reply`, { text: reply.trim() }).then(() => setReply("")); };
  const control = (action: "takeover" | "handback") => { haptic.light(); setBusy(true); computer.act(action).catch((error: unknown) => Alert.alert("Couldn’t do that", error instanceof Error ? error.message : "Try again.")).finally(() => { setBusy(false); void refresh(); }); };
  const stop = () =>
    Alert.alert("Stop this task?", "Anything already done on the computer stays as it is.", [
      { text: "Keep going", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: () => void post(`computer/goals/${goal.goalId}/cancel`, {}) },
    ]);

  return (
    <Animated.View style={{ marginVertical: 4, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}>
          {goal.status === "running" || goal.status === "queued" ? (
            <ShimmerText text={card.label} active style={lineStyle} />
          ) : (
            <Text numberOfLines={1} style={[lineStyle, { color: goal.status === "failed" ? colors.error : goal.status === "cancelled" ? colors.textMuted : colors.text }]}>{outcome ?? card.label}</Text>
          )}
        </View>
        {active && (
          <Pressable accessibilityRole="button" accessibilityLabel="Stop this task" disabled={busy} onPress={stop} hitSlop={8} style={({ pressed }) => ({ opacity: busy ? 0.4 : pressed ? 0.5 : 1 })}>
            <Text style={{ color: colors.textMuted, fontFamily: "DMSans_600SemiBold", fontSize: 13.5 }}>Stop</Text>
          </Pressable>
        )}
      </View>
      <Text numberOfLines={2} style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 12.5 }}>{goal.goal}</Text>

      {onScreen && (
        <Pressable accessibilityRole="button" accessibilityLabel="Open the computer full screen" onPress={() => router.push("/computer" as never)} style={{ borderRadius: 14, overflow: "hidden" }}>
          <LiveView url={computer.view?.liveUrl ?? null} interactive={false} height={liveHeight} onStale={() => void computer.refresh()} />
        </Pressable>
      )}

      {goal.status === "waiting" && goal.waitingFor !== "user_control" && (
        <Animated.View entering={FadeIn.duration(180)} style={{ gap: 10 }}>
          {!!goal.question && <Text style={{ color: colors.text, fontFamily: "DMSans_400Regular", fontSize: 14.5, lineHeight: 21 }}>{goal.question}</Text>}
          {goal.waitingFor === "approval" && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <CardButton label="Approve" onPress={() => answer("approve")} disabled={busy} />
              <CardButton label="Decline" variant="outlined" onPress={() => answer("decline")} disabled={busy} />
            </View>
          )}
          {goal.waitingFor === "login" && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <CardButton label="Open the computer" onPress={() => router.push("/computer" as never)} />
              <CardButton label="I’m done, continue" variant="outlined" onPress={() => answer("continue")} disabled={busy} />
            </View>
          )}
          {goal.waitingFor === "question" && (
            <View style={{ gap: 10 }}>
              <TextInput value={reply} onChangeText={setReply} placeholder="Your answer" placeholderTextColor={colors.textMuted} onSubmitEditing={send}
                style={{ color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 }} />
              <CardButton label="Send" onPress={send} disabled={busy || !reply.trim()} />
            </View>
          )}
        </Animated.View>
      )}

      {active && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {computer.userHasControl
            ? <CardButton label="Hand back" variant="outlined" onPress={() => control("handback")} disabled={busy} />
            : goal.status === "running" && <CardButton label="Take over" variant="outlined" onPress={() => control("takeover")} disabled={busy} />}
          <CardButton label="Watch full screen" variant="text" onPress={() => router.push("/computer" as never)} />
        </View>
      )}

      {!active && (
        <Animated.View entering={FadeIn.duration(180)} style={{ gap: 6 }}>
          {!!goal.summary && (
            <Text selectable style={{ color: colors.text, fontFamily: "DMSans_400Regular", fontSize: 14, lineHeight: 21 }}>
              {goal.summary}
            </Text>
          )}
          {goal.status === "cancelled" && (
            <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13 }}>
              Anything already done on the computer remains.
            </Text>
          )}
          {goal.status === "failed" && <Text style={{ color: colors.error, fontFamily: "DMSans_400Regular", fontSize: 13.5, lineHeight: 19 }}>{goal.error ?? "It didn’t finish."}</Text>}
          {goal.evidence?.map((item) => (
            <Pressable key={item.label + (item.url ?? "")} disabled={!item.url} accessibilityRole={item.url ? "link" : "text"} onPress={() => item.url && void WebBrowser.openBrowserAsync(item.url)}>
              <Text numberOfLines={2} style={{ color: item.url ? colors.textSecondary : colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 18, textDecorationLine: item.url ? "underline" : "none" }}>{item.label}</Text>
            </Pressable>
          ))}
        </Animated.View>
      )}
    </Animated.View>
  );
}
