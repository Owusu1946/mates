import { useAui } from "@assistant-ui/react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMateActions, useMates } from "../../../src/mates/data";
import { MateForm } from "../../../src/mates/mate-form";
import { useTheme } from "../../../src/theme/provider";

/** A mate's profile: edit name, colour and role, or remove the mate and its conversation. */
export default function MateProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mates = useMates();
  const actions = useMateActions();
  const aui = useAui();
  const [error, setError] = useState<string | null>(null);
  const mate = mates.data?.mates.find((m) => m.id === id);

  if (!mates.data) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>{mates.isError ? <Text style={{ color: colors.error }}>Couldn’t load this mate.</Text> : <ActivityIndicator />}</View>;
  if (!mate) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><Text style={{ color: colors.textSecondary }}>This mate no longer exists.</Text></View>;

  // If the deleted conversation is the open one, fall back to Cooper rather than a dead chat.
  const leave = (deletedChatId: string) => {
    router.back();
    const cooper = mates.data?.mates.find((m) => m.isDefault);
    if (cooper && aui.threadListItem.getState().remoteId === deletedChatId) void aui.threads.switchToThread(cooper.chatId);
  };
  const remove = () =>
    Alert.alert(`Remove ${mate.name}?`, "Your conversation with them is deleted too, and they leave any groups. This can’t be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => actions.deleteMate.mutate(mate.id, { onSuccess: () => leave(mate.chatId), onError: (e) => setError(e.message) }),
      },
    ]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: mate.name }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 24 }} keyboardShouldPersistTaps="handled">
        <MateForm
          key={mate.id}
          presets={mates.data.presets}
          initial={mate}
          submitLabel="Save"
          submitting={actions.updateMate.isPending}
          error={error}
          onSubmit={(input) => {
            setError(null);
            actions.updateMate.mutate({ id: mate.id, ...input }, { onSuccess: () => router.back(), onError: (e) => setError(e.message) });
          }}
        />
        {mate.isDefault ? (
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center" }}>{mate.name} leads your team and can’t be removed.</Text>
        ) : (
          <Pressable accessibilityRole="button" onPress={remove} disabled={actions.deleteMate.isPending} style={{ alignSelf: "center", padding: 12 }}>
            <Text style={{ color: colors.error, fontFamily: "DMSans_600SemiBold", fontSize: 16 }}>Remove {mate.name}</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
