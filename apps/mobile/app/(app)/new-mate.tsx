import { useAui } from "@assistant-ui/react-native";
import SegmentedControl from "@expo/ui/community/segmented-control";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMateActions, useMates } from "../../src/mates/data";
import { GroupForm } from "../../src/mates/group-form";
import { MateForm } from "../../src/mates/mate-form";
import { useTheme } from "../../src/theme/provider";

/** Presented as the native page sheet: create a mate or a group, then open its conversation. */
export default function NewMateScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const aui = useAui();
  const mates = useMates();
  const actions = useMateActions();
  const [mode, setMode] = useState<"mate" | "group">("mate");
  const [error, setError] = useState<string | null>(null);

  const open = (chatId: string) => {
    router.back();
    // An unknown id is fetched by the thread list, so the new conversation opens directly.
    void aui.threads.switchToThread(chatId);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 20 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 24, fontFamily: "DMSans_700Bold" }}>
          {mode === "mate" ? "New mate" : "New group"}
        </Text>
        <SegmentedControl
          values={["Mate", "Group"]}
          selectedIndex={mode === "mate" ? 0 : 1}
          appearance={isDark ? "dark" : "light"}
          onChange={(event) => {
            setError(null);
            setMode(event.nativeEvent.selectedSegmentIndex === 0 ? "mate" : "group");
          }}
        />
        {!mates.data ? (
          mates.isError ? (
            <Text style={{ color: colors.error }}>Couldn’t load your mates. Check your connection and try again.</Text>
          ) : (
            <View style={{ paddingVertical: 40 }}><ActivityIndicator /></View>
          )
        ) : mode === "mate" ? (
          <MateForm
            presets={mates.data.presets}
            submitLabel="Create mate"
            submitting={actions.createMate.isPending}
            error={error}
            onSubmit={(input) => {
              setError(null);
              actions.createMate.mutate(input, { onSuccess: (mate) => open(mate.chatId), onError: (e) => setError(e.message) });
            }}
          />
        ) : mates.data.mates.length < 2 ? (
          <Text style={{ color: colors.textSecondary, lineHeight: 22 }}>Create at least one more mate first; a group needs two or more.</Text>
        ) : (
          <GroupForm
            mates={mates.data.mates}
            submitLabel="Create group"
            submitting={actions.createGroup.isPending}
            error={error}
            onSubmit={(input) => {
              setError(null);
              actions.createGroup.mutate(input, { onSuccess: (group) => open(group.chatId), onError: (e) => setError(e.message) });
            }}
          />
        )}
      </ScrollView>
    </View>
  );
}
