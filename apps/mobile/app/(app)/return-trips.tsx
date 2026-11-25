import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { runRequest } from "../../src/chat/background-chat";
import { useTheme } from "../../src/theme/provider";

type ReturnTrip = { id: string; title: string; body: string; createdAt: string; data: Record<string, unknown> };

export default function ReturnTripsScreen() {
  const { getToken, userId } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const query = useQuery({ queryKey: ["return-trips", userId], queryFn: () => runRequest<{ items: ReturnTrip[] }>(getToken, "return-trips"), enabled: !!userId });
  const open = (item: ReturnTrip) => {
    const data = item.data;
    const chatId = typeof data.chatId === "string" ? data.chatId : null;
    if (chatId) {
      router.push({ pathname: "/(app)", params: {
        notificationChatId: chatId,
        ...(typeof data.delegationId === "string" ? { notificationRunId: data.delegationId } : {}),
        ...(typeof data.messageId === "string" ? { notificationMessageId: data.messageId } : {}),
        ...(typeof data.deckId === "string" ? { notificationDeckId: data.deckId } : {}),
        ...(typeof data.computerGoalId === "string" ? { notificationComputerGoalId: data.computerGoalId } : {}),
      } });
    } else if (typeof data.delegationId === "string") router.push({ pathname: "/(app)/feed", params: { runId: data.delegationId } });
  };

  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 10 }}>
    {query.isLoading && <ActivityIndicator color={colors.primary} />}
    {query.isError && <Pressable onPress={() => void query.refetch()} accessibilityRole="button"><Text style={{ color: colors.error }}>Couldn’t load your results. Tap to retry.</Text></Pressable>}
    {query.data?.items.length === 0 && <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 15 }}>Nothing needs opening right now.</Text>}
    {query.data?.items.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => open(item)}
      style={({ pressed }) => ({ padding: 16, gap: 5, borderRadius: 16, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 15 }}>{item.title}</Text>
      <Text numberOfLines={2} style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 14, lineHeight: 20 }}>{item.body}</Text>
    </Pressable>)}
  </ScrollView>;
}
