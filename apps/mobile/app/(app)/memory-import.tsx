import { useAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { createApiClient } from "../../src/data/api";
import { haptic } from "../../src/haptics";
import { ImportFlow, SourcePicker } from "../../src/memory/import-flow";
import type { ImportSource } from "../../src/memory/import-prompts";
import { font, SmallButton } from "../../src/memory/memory-ui";
import { useMates } from "../../src/mates/data";
import { useTheme } from "../../src/theme/provider";

/** Settings → Memory → Import: the same flow as onboarding's, with memory switched on first. */
export default function MemoryImportScreen() {
  const { getToken, userId } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const lead = useMates().data?.mates.find((mate) => mate.isDefault);
  const [source, setSource] = useState<ImportSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settings = useQuery({
    queryKey: ["memories", userId],
    queryFn: async () => {
      const response = await api.v1.memories.$get();
      if (!response.ok) throw new Error("Couldn’t load memories.");
      return (await response.json()) as unknown as { settings: { memoryEnabled: boolean } };
    },
  });
  const off = settings.data ? !settings.data.settings.memoryEnabled : false;

  const turnOn = async () => {
    haptic.selection();
    const response = await api.v1["memory-settings"].$patch({ json: { memoryEnabled: true } }).catch(() => null);
    if (!response?.ok) return setError("Couldn’t turn memory on.");
    await queryClient.invalidateQueries({ queryKey: ["memories", userId] });
  };

  const askLead = () => {
    if (!lead?.chatId) return router.back();
    router.dismissTo({ pathname: "/(app)", params: { notificationChatId: lead.chatId, draft: "What do you know about me now?" } });
  };

  const body = { color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22 } as const;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 56, gap: 20 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {off ? (
        <View style={{ gap: 14, padding: 16, borderRadius: 18, borderCurve: "continuous", backgroundColor: colors.surface }}>
          <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 16 }}>Memory is off</Text>
          <Text style={body}>Turn it on to bring in what another assistant knows about you.</Text>
          {error && <Text style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>{error}</Text>}
          <View style={{ flexDirection: "row" }}>
            <SmallButton label="Turn on memory" strong onPress={() => void turnOn()} />
          </View>
        </View>
      ) : source ? (
        <ImportFlow
          source={source}
          onBack={() => setSource(null)}
          done={() => (
            <View style={{ flexDirection: "row", gap: 8, paddingTop: 6 }}>
              <SmallButton label="Done" onPress={() => router.back()} />
              {lead && <SmallButton label={`Ask ${lead.name} what it learned`} strong onPress={askLead} />}
            </View>
          )}
        />
      ) : (
        <>
          <Text style={body}>Bring what another assistant knows about you into Mates. It takes about a minute, and you choose what comes over.</Text>
          <SourcePicker layout="list" onPick={setSource} />
        </>
      )}
    </ScrollView>
  );
}
