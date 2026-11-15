import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { ChatIcon } from "../../src/chat/chat-icon";
import { createApiClient } from "../../src/data/api";
import { haptic } from "../../src/haptics";
import { usePullToRefresh } from "../../src/hooks/use-pull-to-refresh";
import { useTheme } from "../../src/theme/provider";
import { useMates, type Mate } from "../../src/mates/data";
import { MateAvatar } from "../../src/mates/mate-avatar";
import { useAbout, useSaveAbout } from "../../src/onboarding/about-data";
import { AboutField } from "../../src/onboarding/about-field";

/** `mateId` null: shared by every mate; set: that mate's own note for its role. */
type Memory = { id: string; text: string; category: string; source: string; mateId?: string | null; updatedAt: string };

const SOURCE_LABEL: Record<string, string> = { auto: "Saved automatically", bio: "From what you shared", briefing: "From a briefing", explicit: "You asked" };
type Settings = { memoryEnabled: boolean; autoMemory: boolean; historyRecall: boolean };

const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold" };

/** What the mates remember about you: the switches, what you told them, then every saved memory (shared, then each mate's own). */
export default function MemoryScreen() {
  const { getToken, userId } = useAuth();
  const { colors } = useTheme();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["memories", userId],
    queryFn: async () => {
      const response = await api.v1.memories.$get();
      if (!response.ok) throw new Error("Couldn’t load memories.");
      return (await response.json()) as unknown as { memories: Memory[]; settings: Settings };
    },
  });
  // The spinner follows a pull only, not the reloads after each toggle or edit.
  const pull = usePullToRefresh(() => query.refetch());
  const settings = query.data?.settings ?? { memoryEnabled: true, autoMemory: true, historyRecall: true };
  const memories = query.data?.memories ?? [];
  const shown = search.trim() ? memories.filter((m) => m.text.toLowerCase().includes(search.trim().toLowerCase())) : memories;
  const crew = useMates().data?.mates ?? [];
  // Shared first, then each mate's own notes, in crew order (lead first). Notes of a mate that
  // isn't loaded yet show as shared until it is.
  const known = new Set(crew.map((m) => m.id));
  const sections: { mate: Mate | null; rows: Memory[] }[] = [
    { mate: null, rows: shown.filter((m) => !m.mateId || !known.has(m.mateId)) },
    ...[...crew].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)).map((mate) => ({ mate, rows: shown.filter((m) => m.mateId === mate.id) })),
  ].filter((section) => section.rows.length > 0);
  const grouped = sections.some((section) => section.mate);

  const run = async (work: () => Promise<{ ok: boolean }>, message: string) => {
    setError(null);
    try {
      if (!(await work()).ok) throw new Error(message);
      await query.refetch();
    } catch {
      setError(message);
    }
  };
  const setSetting = (values: Partial<Settings>) => {
    haptic.selection();
    void run(() => api.v1["memory-settings"].$patch({ json: values }), "Couldn’t update memory settings.");
  };
  const save = (id: string, text: string) => run(() => api.v1.memories[":id"].$patch({ param: { id }, json: { text } }), "Couldn’t save that change.").then(() => setEditing(null));
  const share = (id: string) => run(() => api.v1.memories[":id"].$patch({ param: { id }, json: { mateId: null } }), "Couldn’t move that memory.");
  const remove = (id: string) => run(() => api.v1.memories[":id"].$delete({ param: { id } }), "Couldn’t delete that memory.");
  const removeAll = () =>
    Alert.alert("Delete all memories?", "Your mates will forget everything they’ve saved about you. This can’t be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete all", style: "destructive", onPress: () => void run(() => api.v1.memories.$delete(), "Couldn’t delete memories.") },
    ]);

  /** Edit or delete one memory, from the platform's own menu. */
  const options = (memory: Memory) => {
    haptic.light();
    const edit = () => setEditing({ id: memory.id, text: memory.text });
    const del = () => void remove(memory.id);
    const toShared = () => void share(memory.id);
    // A mate's own note can be shared with every mate.
    const actions = [{ text: "Edit", onPress: edit }, ...(memory.mateId ? [{ text: "Share with all mates", onPress: toShared }] : []), { text: "Delete", onPress: del, destructive: true }];
    if (Platform.OS === "ios")
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...actions.map((a) => a.text), "Cancel"], destructiveButtonIndex: actions.length - 1, cancelButtonIndex: actions.length },
        (i) => actions[i]?.onPress(),
      );
    else
      Alert.alert("Memory", memory.text.slice(0, 120), [
        ...actions.map((a) => ({ text: a.text, onPress: a.onPress, style: "destructive" in a ? ("destructive" as const) : undefined })),
        { text: "Cancel", style: "cancel" },
      ]);
  };

  const off = !settings.memoryEnabled;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 56, gap: 22 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22 }}>
        Your mates remember useful things, so you don’t have to repeat yourself.
      </Text>

      <Group>
        <ToggleRow title="Memory" detail="Let your mates save and use memories." value={settings.memoryEnabled} disabled={!query.data} onChange={(memoryEnabled) => setSetting({ memoryEnabled })} />
        <ToggleRow title="Save automatically" detail="Save useful details from your chats." value={settings.autoMemory} disabled={off || !query.data} onChange={(autoMemory) => setSetting({ autoMemory })} />
        <ToggleRow title="Reference chat history" detail="Use relevant past chats and files." value={settings.historyRecall} disabled={off || !query.data} onChange={(historyRecall) => setSetting({ historyRecall })} />
      </Group>

      <Pressable accessibilityRole="link" onPress={() => router.push("/noticed")} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 18, borderCurve: "continuous", backgroundColor: colors.surface, opacity: pressed ? 0.7 : off ? 0.55 : 1 })}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 16 }}>What I’ve noticed</Text>
          <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13, lineHeight: 18 }}>Habits your mates picked up, and what they offer to handle.</Text>
        </View>
        <ChatIcon name="next" color={colors.textMuted} size={16} />
      </Pressable>

      <AboutCard disabled={off} lead={crew.find((m) => m.isDefault)?.name ?? "your mate"} />

      {(error || query.isError) && (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>
          {error ?? "Couldn’t load your memories. Pull down to try again."}
        </Text>
      )}

      <View style={{ gap: 10, opacity: off ? 0.55 : 1 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4 }}>
          <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 17 }}>
            Saved memories{memories.length ? <Text style={{ color: colors.textMuted, fontFamily: font.regular }}>{`  ${memories.length}`}</Text> : null}
          </Text>
          {memories.length > 0 && (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={removeAll} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <Text style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>Delete all</Text>
            </Pressable>
          )}
        </View>

        {memories.length > 5 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 42, paddingHorizontal: 14, borderRadius: 21, backgroundColor: colors.surface }}>
            <ChatIcon name="search" color={colors.textMuted} size={17} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search memories"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search memories"
              style={{ flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 15, paddingVertical: 0 }}
            />
            {search ? (
              <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setSearch("")}>
                <ChatIcon name="close" color={colors.textMuted} size={15} />
              </Pressable>
            ) : null}
          </View>
        )}

        {query.isLoading && <Skeleton />}

        {query.isSuccess && memories.length === 0 && (
          <View style={{ alignItems: "center", gap: 10, paddingVertical: 36 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
              <ChatIcon name="ideas" color={colors.text} size={24} />
            </View>
            <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 16 }}>Nothing saved yet</Text>
            <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 290 }}>
              Tell a mate “remember that…”, or just chat. They’ll keep what’s useful.
            </Text>
          </View>
        )}

        {search.trim() && shown.length === 0 && memories.length > 0 && (
          <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, paddingHorizontal: 4, paddingVertical: 8 }}>No memories match “{search.trim()}”.</Text>
        )}

        {sections.map((section) => (
          <View key={section.mate?.id ?? "shared"} style={{ gap: 8 }}>
            {grouped && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingTop: 6 }}>
                {section.mate ? <MateAvatar gradient={section.mate.gradient} shape={section.mate.shape} size={20} still /> : <ChatIcon name="ideas" color={colors.textMuted} size={16} />}
                <Text style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 14 }}>
                  {section.mate ? `${section.mate.name}’s notes` : "Shared with every mate"}
                </Text>
              </View>
            )}
          <Group>
            {section.rows.map((memory) =>
              editing?.id === memory.id ? (
                <View key={memory.id} style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}>
                  <TextInput
                    value={editing.text}
                    onChangeText={(text) => setEditing({ id: memory.id, text })}
                    multiline
                    maxLength={500}
                    autoFocus
                    accessibilityLabel="Edit memory"
                    style={{ color: colors.text, fontFamily: font.regular, fontSize: 16, lineHeight: 23, minHeight: 46, padding: 0, textAlignVertical: "top" }}
                  />
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                    <SmallButton label="Cancel" onPress={() => setEditing(null)} />
                    <SmallButton label="Save" strong disabled={!editing.text.trim() || editing.text.trim() === memory.text} onPress={() => void save(memory.id, editing.text.trim())} />
                  </View>
                </View>
              ) : (
                <View key={memory.id} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingLeft: 16, paddingRight: 8, paddingVertical: 13 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text selectable style={{ color: colors.text, fontFamily: font.regular, fontSize: 16, lineHeight: 23 }}>{memory.text}</Text>
                    <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 12 }}>
                      {SOURCE_LABEL[memory.source] ?? "You asked"} · {new Date(memory.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Memory options" hitSlop={8} onPress={() => options(memory)} style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.5 : 1 })}>
                    <ChatIcon name="more" color={colors.textMuted} size={18} />
                  </Pressable>
                </View>
              ),
            )}
          </Group>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** "About you": what the user told their mates in their own words, editable by typing or talking. */
function AboutCard({ lead, disabled }: { lead: string; disabled: boolean }) {
  const { colors } = useTheme();
  const about = useAbout();
  const save = useSaveAbout();
  const [draft, setDraft] = useState<string | null>(null);
  const bio = about.data?.bio ?? "";
  if (draft !== null)
    return (
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 17, paddingHorizontal: 4 }}>About you</Text>
        <AboutField value={draft} onChange={setDraft} mateName={lead} autoFocus />
        {save.error && <Text style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>{save.error.message}</Text>}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <SmallButton label="Cancel" onPress={() => setDraft(null)} />
          <SmallButton
            label={save.isPending ? "Saving…" : "Save"}
            strong
            disabled={save.isPending || draft.trim() === bio.trim()}
            onPress={() => {
              const done = { onSuccess: () => { haptic.success(); setDraft(null); } };
              // Clearing it: the memories it produced stay unless the user says otherwise.
              if (!draft.trim() && bio.trim())
                Alert.alert("Clear what you shared?", "Your mates can also forget what they learned from it.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Keep what they learned", onPress: () => save.mutate({ bio: "" }, done) },
                  { text: "Forget that too", style: "destructive", onPress: () => save.mutate({ bio: "", forgetLearned: true }, done) },
                ]);
              else save.mutate({ bio: draft.trim() }, done);
            }}
          />
        </View>
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bio ? "Edit what you shared about yourself" : "Tell your mates about yourself"}
      disabled={!about.data}
      onPress={() => setDraft(bio)}
      style={({ pressed }) => ({ padding: 16, borderRadius: 18, borderCurve: "continuous", backgroundColor: colors.surface, gap: 6, opacity: pressed ? 0.7 : disabled ? 0.55 : 1 })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 16 }}>About you</Text>
        <Text style={{ color: colors.textMuted, fontFamily: font.medium, fontSize: 14 }}>{bio ? "Edit" : "Add"}</Text>
      </View>
      <Text numberOfLines={bio ? 4 : 2} style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>
        {bio || `Tell ${lead} about your work, your people and how you like things done. Type or talk.`}
      </Text>
    </Pressable>
  );
}

/** Rows on one rounded surface, separated by hairlines: no box per row. */
function Group({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={{ borderRadius: 18, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.surface }}>
      {rows.map((row, i) => (
        <View key={i}>
          {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: colors.border }} />}
          {row}
        </View>
      ))}
    </View>
  );
}

function ToggleRow({ title, detail, value, disabled, onChange }: { title: string; detail: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 16, paddingVertical: 13, opacity: disabled ? 0.45 : 1 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 16 }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13, lineHeight: 18 }}>{detail}</Text>
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onChange} accessibilityLabel={title} />
    </View>
  );
}

function SmallButton({ label, strong, disabled, onPress }: { label: string; strong?: boolean; disabled?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: strong ? colors.text : colors.surfaceElevated, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: strong ? colors.background : colors.text, fontFamily: font.semibold, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** Placeholder rows while the first load runs. */
function Skeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface, padding: 16, gap: 18 }}>
      {[0.9, 0.7, 0.8].map((w, i) => (
        <View key={i} style={{ gap: 8 }}>
          <View style={{ width: `${w * 100}%`, height: 12, borderRadius: 6, backgroundColor: colors.surfaceElevated }} />
          <View style={{ width: "30%", height: 9, borderRadius: 5, backgroundColor: colors.surfaceElevated }} />
        </View>
      ))}
    </View>
  );
}
