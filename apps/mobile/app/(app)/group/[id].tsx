import { useAui } from "@assistant-ui/react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMateActions, useMates } from "../../../src/mates/data";
import { GroupForm } from "../../../src/mates/group-form";
import { useTheme } from "../../../src/theme/provider";

/** A group's info: rename, change members and leader, or delete the group. */
export default function GroupProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mates = useMates();
  const actions = useMateActions();
  const aui = useAui();
  const [error, setError] = useState<string | null>(null);
  const group = mates.data?.groups.find((g) => g.chatId === id);

  if (!mates.data) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>{mates.isError ? <Text style={{ color: colors.error }}>Couldn’t load this group.</Text> : <ActivityIndicator />}</View>;
  if (!group) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><Text style={{ color: colors.textSecondary }}>This group no longer exists.</Text></View>;

  // If the deleted conversation is the open one, fall back to Cooper rather than a dead chat.
  const leave = (deletedChatId: string) => {
    router.back();
    const cooper = mates.data?.mates.find((m) => m.isDefault);
    if (cooper && aui.threadListItem.getState().remoteId === deletedChatId) void aui.threads.switchToThread(cooper.chatId);
  };
  const remove = () =>
    Alert.alert(`Delete ${group.name}?`, "The group conversation is deleted. Your mates and their own chats stay.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => actions.deleteGroup.mutate(group.chatId, { onSuccess: () => leave(group.chatId), onError: (e) => setError(e.message) }) },
    ]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: group.name }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 24 }} keyboardShouldPersistTaps="handled">
        <GroupForm
          key={group.chatId}
          mates={mates.data.mates}
          initial={{ name: group.name, mateIds: group.mateIds, leaderMateId: group.leaderMateId ?? undefined }}
          submitLabel="Save"
          submitting={actions.updateGroup.isPending}
          error={error}
          onSubmit={(input) => {
            setError(null);
            actions.updateGroup.mutate({ chatId: group.chatId, ...input }, { onSuccess: () => router.back(), onError: (e) => setError(e.message) });
          }}
        />
        <Pressable accessibilityRole="button" onPress={remove} disabled={actions.deleteGroup.isPending} style={{ alignSelf: "center", padding: 12 }}>
          <Text style={{ color: colors.error, fontFamily: "DMSans_600SemiBold", fontSize: 16 }}>Delete group</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
