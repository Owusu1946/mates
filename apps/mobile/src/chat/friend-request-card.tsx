import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, Linking, Platform, Pressable, Share, Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { FriendAvatar } from "../friends/friend-avatar";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import { runRequest } from "./background-chat";
import { CardButton } from "./card-button";
import { ShimmerText } from "./shimmer-text";

type Slot = { start: string; end: string; reason: string };

/** "Tue 25 Nov · 12:30" in this phone's own timezone. */
const slotDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const slotTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const duration = (minutes: number) => (minutes % 60 === 0 ? `${minutes / 60}h` : minutes > 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`);

/**
 * A request between your mate and a friend's, kept live while it waits. Sent: what you asked, told
 * or proposed, and the answer or booking when it lands. Received: the question with your mate's
 * draft to send as is, edit or pass on; three times to pick from; or an update from a friend's mate.
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
    // An answered request never changes, so a card scrolled back into view doesn't fetch it again.
    staleTime: (query) => (query.state.data?.friendRequest?.status === "waiting" ? 0 : Infinity),
  });
  const card = live.data ?? state;
  const request = card.friendRequest ?? initial;
  const [answer, setAnswer] = useState(request?.draft ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  if (!request) return null;

  const sent = request.role === "sent";
  const waiting = request.status === "waiting";
  const name = request.friendName;
  const meeting = request.meeting;
  const line = { fontFamily: "DMSans_500Medium", fontSize: 14.5, letterSpacing: 0.1 } as const;

  const act = async (what: string, path: string, body: unknown) => {
    setBusy(what);
    try {
      const next = await runRequest<{ card: WorkflowCard }>(getToken, path, body);
      client.setQueryData(key, next.card);
      haptic.success();
    } catch (error) {
      haptic.error();
      Alert.alert("Couldn’t do that", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(null);
    }
  };
  const send = (always = false) => {
    const text = answer.trim();
    if (text) void act("send", `requests/${request.id}/reply`, { action: "send", text, ...(always ? { always: true } : {}) });
  };
  const pick = (index: number) => { haptic.light(); void act(`slot${index}`, `requests/${request.id}/reply`, { action: "pick", slot: index }); };
  const pass = () => void act("pass", `requests/${request.id}/reply`, { action: "decline" });
  const cancel = () =>
    Alert.alert("Take this back?", `${name} won’t be asked any more.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Take back", style: "destructive", onPress: () => void act("cancel", `requests/${request.id}/cancel`, {}) },
    ]);
  const shareLink = async () => {
    if (!request.guest) return;
    haptic.light();
    await Share.share(Platform.OS === "ios" ? { message: request.guest.message.replace(` ${request.guest.url}`, ""), url: request.guest.url } : { message: request.guest.message }).catch(() => undefined);
  };
  const addToCalendar = () => {
    const booked = request.booked;
    if (booked?.link) void WebBrowser.openBrowserAsync(booked.link);
    else if (booked?.ics) void Linking.openURL(booked.ics);
  };

  return (
    <Animated.View style={{ marginVertical: 4, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <FriendAvatar userId={request.friendUserId} name={name} size={26} />
        <View style={{ flex: 1 }}>
          {waiting && sent && !request.guest ? (
            <ShimmerText text={card.label} active style={line} />
          ) : (
            <Text numberOfLines={1} style={[line, { color: card.phase === "error" ? colors.textMuted : colors.text }]}>{card.label}</Text>
          )}
        </View>
        {sent && waiting && (
          <Pressable accessibilityRole="button" accessibilityLabel="Take this back" disabled={!!busy} onPress={cancel} hitSlop={8} style={({ pressed }) => ({ opacity: busy ? 0.4 : pressed ? 0.5 : 1 })}>
            <Text style={{ color: colors.textMuted, fontFamily: "DMSans_600SemiBold", fontSize: 13.5 }}>Take back</Text>
          </Pressable>
        )}
      </View>

      {meeting ? (
        <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 13.5 }}>
          {[meeting.title, duration(meeting.durationMin), meeting.place].filter(Boolean).join(" · ")}
          {request.text && request.text !== meeting.title ? `\n“${request.text}”` : ""}
        </Text>
      ) : (
        <View style={{ borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 12 }}>
          <Text style={{ color: sent ? colors.textSecondary : colors.text, fontFamily: "DMSans_400Regular", fontSize: 14.5, lineHeight: 21 }}>{request.text}</Text>
        </View>
      )}

      {sent && request.status === "held" && (
        <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 12.5, lineHeight: 17 }}>
          {name} is on Mates, so I sent a friend request. As soon as they accept, I’ll {request.kind === "find_time" ? "send them some times" : request.kind === "ask" ? "ask them" : "pass it on"}.
        </Text>
      )}

      {request.booked && (
        <Animated.View entering={FadeIn.duration(220)} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: 16, borderCurve: "continuous", backgroundColor: colors.surface }}>
          <View style={{ width: 52, height: 56, borderRadius: 12, overflow: "hidden", backgroundColor: colors.background, alignItems: "center" }}>
            <View style={{ alignSelf: "stretch", backgroundColor: colors.error, paddingVertical: 2, alignItems: "center" }}>
              <Text style={{ color: "#ffffff", fontFamily: "DMSans_700Bold", fontSize: 10.5, letterSpacing: 0.6 }}>{new Date(request.booked.start).toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</Text>
            </View>
            <Text style={{ color: colors.text, fontFamily: "DMSans_700Bold", fontSize: 22, marginTop: 2 }}>{new Date(request.booked.start).getDate()}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 15 }}>
              {new Date(request.booked.start).toLocaleDateString(undefined, { weekday: "long" })}, {slotTime(request.booked.start)}–{slotTime(request.booked.end)}
            </Text>
            <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 13 }}>
              {request.booked.link ? (sent ? `In your calendar · ${name} is invited` : "The invite is in your email") : "Agreed by both of you"}
            </Text>
          </View>
          {(request.booked.link || request.booked.ics) && (sent || !request.booked.link) && (
            <CardButton label={request.booked.link ? "Open" : "Add"} variant="outlined" onPress={addToCalendar} />
          )}
        </Animated.View>
      )}

      {request.kind === "find_time" && waiting && !!request.slots?.length && (
        sent ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {request.slots.map((slot: Slot) => (
              <View key={slot.start} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.surface }}>
                <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_500Medium", fontSize: 13 }}>{slotDay(slot.start)} · {slotTime(slot.start)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(180)} style={{ gap: 8 }}>
            {request.slots.map((slot: Slot, index: number) => (
              <Pressable
                key={slot.start}
                accessibilityRole="button"
                accessibilityLabel={`Pick ${slotDay(slot.start)} at ${slotTime(slot.start)}`}
                disabled={!!busy}
                onPress={() => pick(index)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderCurve: "continuous", borderWidth: 1, borderColor: index === 0 ? colors.text : colors.border, backgroundColor: pressed ? colors.surface : "transparent", opacity: busy && busy !== `slot${index}` ? 0.4 : 1 })}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 15 }}>{slotDay(slot.start)}</Text>
                  <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 13 }}>{slotTime(slot.start)}–{slotTime(slot.end)}{slot.reason.startsWith("Free for everyone") ? " · works for both of you" : ""}</Text>
                </View>
                <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 13.5 }}>{busy === `slot${index}` ? "Booking…" : "Pick"}</Text>
              </Pressable>
            ))}
            <CardButton label="None of these work" variant="text" onPress={pass} disabled={!!busy} />
          </Animated.View>
        )
      )}

      {sent && request.guest && (
        <Animated.View entering={FadeIn.duration(180)} style={{ gap: 6 }}>
          <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 12.5, lineHeight: 17 }}>
            {name} isn’t one of your friends yet. Send them the link: they {request.kind === "find_time" ? "pick a time" : request.kind === "ask" ? "answer" : "see it"} on a web page, with or without Mates. Or tell me their email and I’ll add them as a friend.
          </Text>
          <CardButton label={`Send ${name} the link`} onPress={() => void shareLink()} />
        </Animated.View>
      )}

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
            <CardButton label={busy === "send" ? "Sending…" : "Send"} onPress={() => send()} disabled={!!busy || !answer.trim()} />
            <CardButton label="Pass" variant="outlined" onPress={pass} disabled={!!busy} />
          </View>
          <CardButton label={`Send, and always let ${name}’s mate get answers`} variant="text" onPress={() => send(true)} disabled={!!busy || !answer.trim()} />
        </Animated.View>
      )}
    </Animated.View>
  );
}
