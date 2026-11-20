import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { FriendAvatar } from "../friends/friend-avatar";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import { runRequest } from "./background-chat";
import { CardButton } from "./card-button";
import { ShimmerText } from "./shimmer-text";

/**
 * A request between your mate and a friend's, kept live while it waits. Sent: what you asked or
 * told, and the answer when it lands. Received: the question with your mate's draft to send as is,
 * edit or pass on, and Always allow; or an update from a friend's mate.
 */
export function FriendRequestCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const initial = state.friendRequest;
  const key = ["friend-request", userId, initial?.id];
  const live = useQuery({
    queryKey: key,
    enabled: !!initial,
    initialData: state,
    queryFn: async () => (await runRequest<{ card: WorkflowCard }>(getToken, `requests/${initial!.id}`)).card,
    refetchInterval: (query) => (query.state.data?.friendRequest?.status === "waiting" ? 3_000 : false),
  });
  const card = live.data ?? state;
  const request = card.friendRequest ?? initial;
  const [answer, setAnswer] = useState(request?.draft ?? "");
  const [busy, setBusy] = useState(false);
  if (!request) return null;

  const sent = request.role === "sent";
  const waiting = request.status === "waiting";
  const name = request.friendName;
  const line = { fontFamily: "DMSans_500Medium", fontSize: 14.5, letterSpacing: 0.1 } as const;

  const act = async (path: string, body: unknown, success?: () => void) => {
    setBusy(true);
    try {
      const next = await runRequest<{ card: WorkflowCard }>(getToken, path, body);
      client.setQueryData(key, next.card);
      haptic.success();
      success?.();
    } catch (error) {
      haptic.error();
      Alert.alert("Couldn’t do that", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };
  const send = (always = false) => {
    const text = answer.trim();
    if (!text) return;
    void act(`requests/${request.id}/reply`, { action: "send", text, ...(always ? { always: true } : {}) });
  };
  const pass = () => void act(`requests/${request.id}/reply`, { action: "decline" });
  const cancel = () =>
    Alert.alert("Take this back?", `${name} won’t be asked any more.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Take back", style: "destructive", onPress: () => void act(`requests/${request.id}/cancel`, {}) },
    ]);

  return (
    <Animated.View layout={LinearTransition.duration(200)} style={{ marginVertical: 4, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <FriendAvatar userId={request.friendUserId} name={name} size={26} />
        <View style={{ flex: 1 }}>
          {waiting && sent ? (
            <ShimmerText text={card.label} active style={line} />
          ) : (
            <Text numberOfLines={1} style={[line, { color: card.phase === "error" ? colors.textMuted : colors.text }]}>{card.label}</Text>
          )}
        </View>
        {sent && waiting && (
          <Pressable accessibilityRole="button" accessibilityLabel="Take back this question" disabled={busy} onPress={cancel} hitSlop={8} style={({ pressed }) => ({ opacity: busy ? 0.4 : pressed ? 0.5 : 1 })}>
            <Text style={{ color: colors.textMuted, fontFamily: "DMSans_600SemiBold", fontSize: 13.5 }}>Take back</Text>
          </Pressable>
        )}
      </View>

      <View style={{ borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 12 }}>
        <Text style={{ color: sent ? colors.textSecondary : colors.text, fontFamily: "DMSans_400Regular", fontSize: 14.5, lineHeight: 21 }}>{request.text}</Text>
      </View>

      {!!request.answer && (
        <Animated.View entering={FadeIn.duration(220)} style={{ gap: 4, padding: 12, borderRadius: 14, borderCurve: "continuous", backgroundColor: colors.surface }}>
          <Text style={{ color: colors.textMuted, fontFamily: "DMSans_600SemiBold", fontSize: 12, letterSpacing: 0.2 }}>
            {sent ? (request.answer.by === "person" ? name : `${name}’s mate`) : request.policy === "allowed" ? "Your mate answered" : "You answered"}
          </Text>
          <Text style={{ color: colors.text, fontFamily: "DMSans_400Regular", fontSize: 15, lineHeight: 22 }}>{request.answer.text}</Text>
        </Animated.View>
      )}

      {!sent && request.kind === "ask" && waiting && (
        <Animated.View entering={FadeIn.duration(180)} style={{ gap: 10 }}>
          <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 12.5, lineHeight: 17 }}>
            {request.draft ? "Your mate wrote this from what it knows. Send it, change it, or pass." : "Your mate wasn’t sure, so it’s your call."}
          </Text>
          <TextInput
            value={answer}
            onChangeText={setAnswer}
            multiline
            placeholder={`Your answer to ${name}`}
            placeholderTextColor={colors.textMuted}
            style={{ color: colors.text, fontFamily: "DMSans_400Regular", fontSize: 15, lineHeight: 21, minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 11 }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <CardButton label="Send" onPress={() => send()} disabled={busy || !answer.trim()} />
            <CardButton label="Pass" variant="outlined" onPress={pass} disabled={busy} />
          </View>
          <CardButton label={`Send, and always let ${name}’s mate get answers`} variant="text" onPress={() => send(true)} disabled={busy || !answer.trim()} />
        </Animated.View>
      )}
    </Animated.View>
  );
}
