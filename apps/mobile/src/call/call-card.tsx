import { useAuth } from "@clerk/expo";
import BottomSheet, { BottomSheetView } from "@expo/ui/community/bottom-sheet";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { runRequest } from "../chat/background-chat";
import { RichText, type RichTextColors } from "../components/rich-text/rich-text";
import { useTheme } from "../theme/provider";
import { formatDuration } from "./call-model";
import { MateAvatar } from "./call-ui";

type CallInfo = NonNullable<WorkflowCard["call"]>;
type CallDetail = { transcript: { speaker: string; text: string; at: string }[] };

/** What a voice call left in the chat: who was on it, the summary, what was agreed, the transcript. */
export function CallCard({ call }: { call: CallInfo }) {
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const colors: RichTextColors = isDark
    ? { text: "#fafafa", muted: "#a1a1aa", surface: "#232326", border: "#353538" }
    : { text: "#18181b", muted: "#71717a", surface: "#fafafa", border: "#e9e9ec" };
  const names = call.mates.map((m) => m.name).join(", ");
  return (
    <View style={{ width: "100%", alignSelf: "stretch", marginVertical: 12, padding: 18, borderRadius: 22, borderCurve: "continuous", backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flexDirection: "row" }}>
          {call.mates.slice(0, 4).map((mate, i) => (
            <View key={mate.id} style={{ marginLeft: i ? -12 : 0 }}>
              <MateAvatar size={34} gradient={mate.gradient as [string, string, string]} shape={mate.shape} still />
            </View>
          ))}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 16, color: colors.text }}>Voice call</Text>
          <Text numberOfLines={1} style={{ fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.muted }}>
            {formatDuration(call.durationSec)}{names ? ` · with ${names}` : ""}
          </Text>
        </View>
      </View>
      <RichText colors={colors} size="compact">{call.summary}</RichText>
      {call.actionItems.length > 0 && (
        <View style={{ gap: 6 }}>
          {call.actionItems.map((item, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 15, lineHeight: 22, color: colors.muted }}>•</Text>
              <Text style={{ flex: 1, fontFamily: "DMSans_400Regular", fontSize: 15, lineHeight: 22, color: colors.text }}>{item}</Text>
            </View>
          ))}
        </View>
      )}
      {call.lines > 0 && (
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)} hitSlop={8} style={{ alignSelf: "flex-start" }}>
          <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 14, color: colors.text, textDecorationLine: "underline" }}>View transcript</Text>
        </Pressable>
      )}
      {open && <TranscriptSheet callId={call.callId} colors={colors} onClose={() => setOpen(false)} />}
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
