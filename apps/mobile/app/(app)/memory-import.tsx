import { useAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ChatIcon } from "../../src/chat/chat-icon";
import { useToast } from "../../src/components/toast";
import { createApiClient } from "../../src/data/api";
import { haptic } from "../../src/haptics";
import { promptFor, SOURCES, type ImportSource } from "../../src/memory/import-prompts";
import { font, Group, SmallButton } from "../../src/memory/memory-ui";
import { useMates } from "../../src/mates/data";
import { useTheme } from "../../src/theme/provider";

const MAX_CHARS = 50_000;

type Item = { key: string; text: string; category: string; importance: number; sensitive: boolean; conflict: { id: string; text: string } | null };
type Preview = { items: Item[]; known: { text: string; existing: string }[]; truncated: boolean };

/** The preview's groups, in the order people think about themselves. */
const GROUPS: { title: string; categories: string[] }[] = [
  { title: "About you", categories: ["identity", "location"] },
  { title: "Work", categories: ["work"] },
  { title: "People", categories: ["relationships"] },
  { title: "Preferences", categories: ["preference"] },
  { title: "Goals and projects", categories: ["goals", "projects"] },
  { title: "Other", categories: ["health", "finance", "other"] },
];
const groupOf = (category: string) => GROUPS.find((group) => group.categories.includes(category)) ?? GROUPS[GROUPS.length - 1]!;

/**
 * Bring in what another assistant knows: pick it, run our prompt there, paste its answer back,
 * then tick what to keep. Nothing is saved until "Import".
 */
export default function MemoryImportScreen() {
  const { getToken, userId } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const lead = useMates().data?.mates.find((mate) => mate.isDefault);
  const settings = useQuery({
    queryKey: ["memories", userId],
    queryFn: async () => {
      const response = await api.v1.memories.$get();
      if (!response.ok) throw new Error("Couldn’t load memories.");
      return (await response.json()) as unknown as { settings: { memoryEnabled: boolean } };
    },
  });

  const [sourceId, setSourceId] = useState<ImportSource | null>(null);
  const [text, setText] = useState("");
  const [clipboardHasText, setClipboardHasText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [useTheirs, setUseTheirs] = useState<Record<string, boolean>>({});
  const [showKnown, setShowKnown] = useState(false);
  const [imported, setImported] = useState<number | null>(null);

  const source = SOURCES.find((item) => item.id === sourceId) ?? null;
  const off = settings.data ? !settings.data.settings.memoryEnabled : false;

  // Coming back from the other assistant: offer its answer straight from the clipboard.
  useEffect(() => {
    if (!source || preview) return;
    void Clipboard.hasStringAsync().then(setClipboardHasText).catch(() => setClipboardHasText(false));
  }, [source, preview, text]);

  const turnOn = async () => {
    haptic.selection();
    const response = await api.v1["memory-settings"].$patch({ json: { memoryEnabled: true } }).catch(() => null);
    if (!response?.ok) return setError("Couldn’t turn memory on.");
    await queryClient.invalidateQueries({ queryKey: ["memories", userId] });
  };

  const copyAndOpen = async () => {
    if (!source) return;
    haptic.light();
    const prompt = promptFor(source);
    await Clipboard.setStringAsync(prompt);
    if (!source.url) return toast.show({ message: "Prompt copied", tone: "success" });
    toast.show({ message: source.prefill ? `Prompt copied. Opening ${source.name}…` : `Prompt copied. Paste it in ${source.name}.`, tone: "success" });
    await Linking.openURL(source.url(prompt)).catch(() => toast.show({ message: `Couldn’t open ${source.name}. Paste the prompt there yourself.`, tone: "error" }));
  };

  const pasteFromClipboard = async () => {
    const pasted = await Clipboard.getStringAsync().catch(() => "");
    if (pasted.trim()) setText(pasted);
  };

  const review = async () => {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.v1.memories.import.$post({ json: { source: source.id, text: text.slice(0, MAX_CHARS) } });
      const body = (await response.json()) as unknown as Preview & { error?: { message: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Couldn’t read that. Try again.");
      haptic.success();
      setPreview(body);
      // Sensitive facts and conflicts start unticked: the user opts in to those.
      setTicked(Object.fromEntries(body.items.map((item) => [item.key, !item.sensitive && !item.conflict])));
      setUseTheirs({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t read that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const chosen = preview?.items.filter((item) => (item.conflict ? useTheirs[item.key] : ticked[item.key])) ?? [];

  const confirm = async () => {
    if (!source || !chosen.length) return;
    setBusy(true);
    setError(null);
    try {
      const items = chosen.map((item) => ({ text: item.text, category: item.category as never, importance: item.importance, ...(item.conflict ? { replaces: item.conflict.id } : {}) }));
      const response = await api.v1.memories.import.confirm.$post({ json: { source: source.id, items } });
      const body = (await response.json()) as unknown as { imported: number; error?: { message: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Couldn’t import. Try again.");
      haptic.success();
      await queryClient.invalidateQueries({ queryKey: ["memories", userId] });
      setImported(body.imported);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t import. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const askLead = () => {
    if (!lead?.chatId) return router.back();
    router.dismissTo({ pathname: "/(app)", params: { notificationChatId: lead.chatId, draft: "What do you know about me now?" } });
  };

  const body = { color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22 } as const;
  const heading = { color: colors.text, fontFamily: font.semibold, fontSize: 17, paddingHorizontal: 4 } as const;

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
          <View style={{ flexDirection: "row" }}>
            <SmallButton label="Turn on memory" strong onPress={() => void turnOn()} />
          </View>
        </View>
      ) : imported !== null ? (
        <View style={{ alignItems: "center", gap: 12, paddingVertical: 32 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
            <ChatIcon name="check" color={colors.text} size={26} />
          </View>
          <Text accessibilityLiveRegion="polite" style={{ color: colors.text, fontFamily: font.semibold, fontSize: 18, textAlign: "center" }}>
            Imported {imported} {imported === 1 ? "memory" : "memories"} from {source?.id === "other" ? "your assistant" : source?.name}
          </Text>
          <Text style={[body, { textAlign: "center", maxWidth: 300 }]}>Every mate can use them now. You can edit or remove them in Memory.</Text>
          <View style={{ flexDirection: "row", gap: 8, paddingTop: 6 }}>
            <SmallButton label="Done" onPress={() => router.back()} />
            {lead && <SmallButton label={`Ask ${lead.name} what it learned`} strong onPress={askLead} />}
          </View>
        </View>
      ) : !source ? (
        <>
          <Text style={body}>Bring what ChatGPT, Claude, Gemini or Grok knows about you into Mates. It takes about a minute, and you choose what comes over.</Text>
          <Text style={heading}>Where are you coming from?</Text>
          <Group>
            {SOURCES.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => {
                  haptic.selection();
                  setSourceId(item.id);
                }}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 15, opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ flex: 1, color: colors.text, fontFamily: font.medium, fontSize: 16 }}>{item.name}</Text>
                <ChatIcon name="next" color={colors.textMuted} size={16} />
              </Pressable>
            ))}
          </Group>
        </>
      ) : !preview ? (
        <>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { setSourceId(null); setText(""); setError(null); }} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.5 : 1 })}>
            <ChatIcon name="chevronLeft" color={colors.textSecondary} size={16} />
            <Text style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 14 }}>{source.name}</Text>
          </Pressable>

          <View style={{ gap: 10 }}>
            <Text style={heading}>1. Ask {source.id === "other" ? "your assistant" : source.name}</Text>
            <View style={{ gap: 14, padding: 16, borderRadius: 18, borderCurve: "continuous", backgroundColor: colors.surface }}>
              <Text style={body}>{source.hint}</Text>
              <Text numberOfLines={4} selectable style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 13, lineHeight: 19 }}>{promptFor(source)}</Text>
              <View style={{ flexDirection: "row" }}>
                <SmallButton label={source.url ? `Copy prompt and open ${source.name}` : "Copy prompt"} strong onPress={() => void copyAndOpen()} />
              </View>
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={heading}>2. Paste its answer</Text>
              {clipboardHasText && !text && <SmallButton label="Paste" onPress={() => void pasteFromClipboard()} />}
            </View>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder={`Paste what ${source.id === "other" ? "it" : source.name} wrote about you`}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Pasted answer"
              style={{ minHeight: 160, maxHeight: 320, padding: 16, borderRadius: 18, borderCurve: "continuous", backgroundColor: colors.surface, color: colors.text, fontFamily: font.regular, fontSize: 15, lineHeight: 21, textAlignVertical: "top" }}
            />
            {text.length > MAX_CHARS && <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 13, paddingHorizontal: 4 }}>Only the first 50,000 characters will be read.</Text>}
          </View>

          {error && <Text accessibilityLiveRegion="polite" style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>{error}</Text>}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
            {busy && (
              <>
                <ActivityIndicator color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 14 }}>Reading…</Text>
              </>
            )}
            <SmallButton label="Review" strong disabled={busy || text.trim().length < 20} onPress={() => void review()} />
          </View>
        </>
      ) : (
        <>
          <Text style={body}>
            Found {preview.items.length} new {preview.items.length === 1 ? "thing" : "things"} about you. Untick anything you don’t want your mates to know.
            {preview.truncated ? " That was a long list, so only the first 150 are shown." : ""}
          </Text>

          {GROUPS.map((group) => {
            const rows = preview.items.filter((item) => groupOf(item.category) === group);
            if (!rows.length) return null;
            return (
              <View key={group.title} style={{ gap: 8 }}>
                <Text style={[heading, { fontSize: 15, color: colors.textSecondary, fontFamily: font.medium }]}>{group.title}</Text>
                <Group>
                  {rows.map((item) =>
                    item.conflict ? (
                      <View key={item.key} style={{ paddingHorizontal: 16, paddingVertical: 13, gap: 10 }}>
                        <Text style={{ color: colors.text, fontFamily: font.regular, fontSize: 15, lineHeight: 21 }}>
                          {source.id === "other" ? "Your assistant" : source.name} says: <Text style={{ fontFamily: font.medium }}>{item.text}</Text>
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>Mates has: {item.conflict.text}</Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <SmallButton label="Keep Mates’" strong={!useTheirs[item.key]} onPress={() => setUseTheirs((current) => ({ ...current, [item.key]: false }))} />
                          <SmallButton label={`Use ${source.id === "other" ? "the new one" : `${source.name}’s`}`} strong={!!useTheirs[item.key]} onPress={() => setUseTheirs((current) => ({ ...current, [item.key]: true }))} />
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        key={item.key}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !!ticked[item.key] }}
                        onPress={() => {
                          haptic.selection();
                          setTicked((current) => ({ ...current, [item.key]: !current[item.key] }));
                        }}
                        style={({ pressed }) => ({ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 13, opacity: pressed ? 0.6 : 1 })}
                      >
                        <View style={{ width: 22, height: 22, marginTop: 1, borderRadius: 7, borderWidth: 1.5, alignItems: "center", justifyContent: "center", borderColor: ticked[item.key] ? colors.text : colors.textMuted, backgroundColor: ticked[item.key] ? colors.text : "transparent" }}>
                          {ticked[item.key] && <ChatIcon name="check" color={colors.background} size={14} />}
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={{ color: colors.text, fontFamily: font.regular, fontSize: 15, lineHeight: 21 }}>{item.text}</Text>
                          {item.sensitive && <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 12 }}>Sensitive · tick to keep</Text>}
                        </View>
                      </Pressable>
                    ),
                  )}
                </Group>
              </View>
            );
          })}

          {preview.known.length > 0 && (
            <View style={{ gap: 8 }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: showKnown }} onPress={() => setShowKnown((value) => !value)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4, opacity: pressed ? 0.5 : 1 })}>
                <Text style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 14 }}>
                  {preview.known.length} already known, skipped
                </Text>
                <ChatIcon name="chevronDown" color={colors.textMuted} size={14} />
              </Pressable>
              {showKnown && (
                <Group>
                  {preview.known.map((item, i) => (
                    <Text key={i} style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20, paddingHorizontal: 16, paddingVertical: 11 }}>{item.text}</Text>
                  ))}
                </Group>
              )}
            </View>
          )}

          {error && <Text accessibilityLiveRegion="polite" style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>{error}</Text>}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
            {busy && <ActivityIndicator color={colors.textMuted} />}
            <SmallButton label="Back" disabled={busy} onPress={() => setPreview(null)} />
            <SmallButton label={chosen.length ? `Import ${chosen.length}` : "Import"} strong disabled={busy || !chosen.length} onPress={() => void confirm()} />
          </View>
        </>
      )}
    </ScrollView>
  );
}
