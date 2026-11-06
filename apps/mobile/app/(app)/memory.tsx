import { useAuth } from "@clerk/expo";
import { Button, Host } from "@expo/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { createApiClient } from "../../src/data/api";
import { useTheme } from "../../src/theme/provider";

type Memory = { id: string; text: string; category: string; source: string; updatedAt: string };
type Settings = { memoryEnabled: boolean; autoMemory: boolean; historyRecall: boolean };

export default function MemoryScreen() {
  const { getToken, userId } = useAuth();
  const { colors, isDark } = useTheme();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["memories", userId],
    queryFn: async () => {
      const response = await api.v1.memories.$get();
      if (!response.ok) throw new Error("Couldn’t load memories.");
      return (await response.json()) as unknown as { memories: Memory[]; settings: Settings };
    },
  });
  const settings = query.data?.settings ?? { memoryEnabled: true, autoMemory: true, historyRecall: true };
  const memories = query.data?.memories ?? [];

  const run = async (work: () => Promise<{ ok: boolean }>, message: string) => {
    setError(null);
    try {
      if (!(await work()).ok) throw new Error(message);
      await query.refetch();
    } catch {
      setError(message);
    }
  };
  const setSetting = (values: Partial<Settings>) =>
    run(() => api.v1["memory-settings"].$patch({ json: values }), "Couldn’t update memory settings.");
  const save = (id: string, text: string) =>
    run(() => api.v1.memories[":id"].$patch({ param: { id }, json: { text } }), "Couldn’t save that change.").then(() => setEditing(null));
  const remove = (id: string) => run(() => api.v1.memories[":id"].$delete({ param: { id } }), "Couldn’t delete that memory.");
  const removeAll = () =>
    Alert.alert("Delete all memories?", "Cooper will forget everything it has saved about you. This can’t be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete all", style: "destructive", onPress: () => void run(() => api.v1.memories.$delete(), "Couldn’t delete memories.") },
    ]);

  const host = (children: React.ReactNode) => <Host matchContents colorScheme={isDark ? "dark" : "light"}>{children}</Host>;
  const row = { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 16 };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => void query.refetch()} />}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}>
        Cooper remembers useful things you tell it, so you don’t have to repeat yourself. You’re in control: edit or delete anything here.
      </Text>

      <View style={{ padding: 16, gap: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
        <View style={row}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>Memory</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Let Cooper use and save memories.</Text>
          </View>
          <Switch value={settings.memoryEnabled} onValueChange={(memoryEnabled) => void setSetting({ memoryEnabled })} accessibilityLabel="Memory" />
        </View>
        <View style={[row, { opacity: settings.memoryEnabled ? 1 : 0.5 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>Save automatically</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Cooper decides what’s worth remembering. You’ll see “Memory updated” when it does.</Text>
          </View>
          <Switch
            value={settings.autoMemory}
            disabled={!settings.memoryEnabled}
            onValueChange={(autoMemory) => void setSetting({ autoMemory })}
            accessibilityLabel="Save memories automatically"
          />
        </View>
        <View style={[row, { opacity: settings.memoryEnabled ? 1 : 0.5 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>Reference chat history</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Cooper can look back at earlier chats and files you’ve shared when they’re relevant.</Text>
          </View>
          <Switch
            value={settings.historyRecall}
            disabled={!settings.memoryEnabled}
            onValueChange={(historyRecall) => void setSetting({ historyRecall })}
            accessibilityLabel="Reference chat history"
          />
        </View>
      </View>

      {error && <Text style={{ color: colors.error }}>{error}</Text>}
      {query.isError && <Text style={{ color: colors.error }}>Couldn’t load your memories. Pull down to retry.</Text>}
      {query.isLoading && <Text style={{ color: colors.textSecondary }}>Loading memories…</Text>}

      <View style={row}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>Saved memories</Text>
        {memories.length > 0 && host(<Button label="Delete all" variant="text" onPress={removeAll} />)}
      </View>
      {query.isSuccess && memories.length === 0 && (
        <Text style={{ color: colors.textSecondary, lineHeight: 21 }}>
          Nothing saved yet. Tell Cooper “remember that…” or just chat — it will keep what’s useful.
        </Text>
      )}
      {memories.map((memory) => (
        <View key={memory.id} style={{ padding: 16, gap: 8, borderRadius: 18, borderWidth: 1, borderColor: colors.border }}>
          {editing?.id === memory.id ? (
            <>
              <TextInput
                value={editing.text}
                onChangeText={(text) => setEditing({ id: memory.id, text })}
                multiline
                maxLength={500}
                autoFocus
                accessibilityLabel="Edit memory"
                style={{ color: colors.text, fontSize: 16, lineHeight: 22, minHeight: 44, padding: 0 }}
              />
              <View style={{ flexDirection: "row", gap: 4, marginLeft: -8 }}>
                {host(<Button label="Save" variant="text" disabled={!editing.text.trim()} onPress={() => void save(memory.id, editing.text.trim())} />)}
                {host(<Button label="Cancel" variant="text" onPress={() => setEditing(null)} />)}
              </View>
            </>
          ) : (
            <>
              <Text style={{ color: colors.text, fontSize: 16, lineHeight: 22 }}>{memory.text}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {memory.category} · {memory.source === "auto" ? "saved by Cooper" : "you asked"} · {new Date(memory.updatedAt).toLocaleDateString()}
              </Text>
              <View style={{ flexDirection: "row", gap: 4, marginLeft: -8 }}>
                {host(<Button label="Edit" variant="text" onPress={() => setEditing({ id: memory.id, text: memory.text })} />)}
                {host(<Button label="Delete" variant="text" onPress={() => void remove(memory.id)} />)}
              </View>
            </>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
