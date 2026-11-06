import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMission } from "../../../src/mates/mission";
import { useTheme } from "../../../src/theme/provider";

/** The team's shared workspace: every note a mate wrote, newest first, expandable in full. */
export default function MissionNotesScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const mission = useMission(chatId);
  const [open, setOpen] = useState<string | null>(null);
  const data = mission.data;

  if (!data)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        {mission.isLoading ? <ActivityIndicator /> : <Text style={{ color: colors.textSecondary }}>No mission in this group yet.</Text>}
      </View>
    );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 14 }}
      refreshControl={<RefreshControl refreshing={mission.isRefetching} onRefresh={() => void mission.refetch()} />}
    >
      <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>MISSION · ROUND {data.round} · {data.status.replace("_", " ").toUpperCase()}</Text>
      <Text style={{ color: colors.text, fontSize: 17, lineHeight: 24, fontFamily: "DMSans_500Medium" }}>{data.goal}</Text>
      {data.summary && (
        <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.surface }}>
          <Markdown style={{ body: { color: colors.text, fontSize: 15, lineHeight: 22 } }}>{data.summary}</Markdown>
        </View>
      )}
      {data.notes.length === 0 && <Text style={{ color: colors.textSecondary }}>The team hasn’t written any notes yet.</Text>}
      {data.notes.map((note) => {
        const expanded = open === note.id;
        return (
          <Pressable
            key={note.id}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setOpen(expanded ? null : note.id)}
            style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border, gap: 6 }}
          >
            <Text style={{ color: colors.text, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>{note.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              v{note.version}
              {note.author ? ` · ${note.author}` : ""} · {new Date(note.updatedAt).toLocaleString()}
            </Text>
            {expanded ? (
              <Markdown style={{ body: { color: colors.text, fontSize: 15, lineHeight: 22 } }}>{note.content}</Markdown>
            ) : (
              <Text numberOfLines={3} style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>{note.content}</Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
