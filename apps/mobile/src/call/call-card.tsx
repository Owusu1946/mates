import { useAuth } from "@clerk/expo";
import BottomSheet, { BottomSheetView } from "@expo/ui/community/bottom-sheet";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { runRequest } from "../chat/background-chat";
import { ChatIcon } from "../chat/chat-icon";
import { RichText, type RichTextColors } from "../components/rich-text/rich-text";
import { useTheme } from "../theme/provider";
import { MateAvatar } from "./call-ui";

type CallInfo = NonNullable<WorkflowCard["call"]>;
type CallDetail = { transcript: { speaker: string; text: string; at: string }[] };

/** A call's length in words: "45 sec", "4 min", "1 h 5 min". */
function lengthText(seconds: number) {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""}`;
}

/**
 * What a voice call or meeting left in the chat, set like a reply rather than a boxed card: a quiet
 * line with who was on it, the summary as reply text, the action items, and a pill for the transcript.
 */
export function CallCard({ call, meeting = false }: { call: CallInfo; meeting?: boolean }) {
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const colors: RichTextColors = isDark
    ? { text: "#fafafa", muted: "#a1a1aa", surface: "#232326", border: "#353538" }
    : { text: "#18181b", muted: "#71717a", surface: "#f4f4f5", border: "#e9e9ec" };
  const names = call.mates.map((m) => m.name).join(", ");
  return (
    <View style={{ width: "100%", alignSelf: "stretch", marginVertical: 10, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {call.mates.length > 0 && (
          <View style={{ flexDirection: "row" }}>
            {call.mates.slice(0, 4).map((mate, i) => (
              <View key={mate.id} style={{ marginLeft: i ? -7 : 0 }}>
                <MateAvatar size={20} gradient={mate.gradient as [string, string, string]} shape={mate.shape} still />
              </View>
            ))}
          </View>
        )}
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.muted }}>
          {meeting ? "Meeting notes" : "Voice call"} · {lengthText(call.durationSec)}
          {names ? ` · with ${names}` : ""}
        </Text>
      </View>

      <RichText colors={colors}>{call.summary}</RichText>

      {call.actionItems.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 15, color: colors.text }}>Action items</Text>
          {call.actionItems.map((item, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 10, backgroundColor: colors.muted }} />
              <Text style={{ flex: 1, fontFamily: "DMSans_400Regular", fontSize: 16, lineHeight: 24, color: colors.text }}>{item}</Text>
            </View>
          ))}
        </View>
      )}

      {call.lines > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          hitSlop={6}
          style={({ pressed }) => ({ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 })}
        >
          <ChatIcon name="captions" color={colors.text} size={15} />
          <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.text }}>View transcript</Text>
        </Pressable>
      )}
      {open && <TranscriptSheet callId={call.callId} colors={{ ...colors, surface: isDark ? "#232326" : "#fafafa" }} onClose={() => setOpen(false)} />}
    </View>
  );
}

function TranscriptSheet({ callId, colors, onClose }: { callId: string; colors: RichTextColors; onClose: () => void }) {
  const { getToken, userId } = useAuth();
  const detail = useQuery({
    queryKey: ["call", userId, callId],
    queryFn: async () => (await runRequest<{ call: CallDetail }>(getToken, `calls/${callId}`)).call,
    staleTime: Infinity,
  });
  return (
    <BottomSheet index={0} enablePanDownToClose enableDynamicSizing onClose={onClose} backgroundStyle={{ backgroundColor: colors.surface }}>
      <BottomSheetView style={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 28, gap: 12 }}>
        <Text accessibilityRole="header" style={{ fontFamily: "DMSans_600SemiBold", fontSize: 20, color: colors.text }}>Transcript</Text>
        {detail.isPending && <ActivityIndicator color={colors.muted} />}
        {detail.isError && <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 14, color: colors.muted }}>Couldn’t load the transcript. Check your connection and try again.</Text>}
        {detail.data && (
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 10 }}>
            {detail.data.transcript.map((line, i) => (
              <Text key={i} style={{ fontFamily: "DMSans_400Regular", fontSize: 15, lineHeight: 22, color: colors.text }}>
                <Text style={{ fontFamily: "DMSans_600SemiBold" }}>{line.speaker}: </Text>
                {line.text}
              </Text>
            ))}
          </ScrollView>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
}
