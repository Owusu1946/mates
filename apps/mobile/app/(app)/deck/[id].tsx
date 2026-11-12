import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WorkingDots } from "../../../src/chat/activity-line";
import { runRequest } from "../../../src/chat/background-chat";
import { ChatIcon } from "../../../src/chat/chat-icon";
import { SlideView } from "../../../src/decks/slide";
import { deckBusy, deckKey, shareDeck, useDeck, type DeckView } from "../../../src/decks/use-deck";
import { haptic } from "../../../src/haptics";
import { useTheme } from "../../../src/theme/provider";

/** A deck full screen: swipe through the slides with their notes, change one, undo, or share it. */
export default function DeckScreen() {
  const { id, slide } = useLocalSearchParams<{ id: string; slide?: string }>();
  const { colors } = useTheme();
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const query = useDeck(id);
  const deck = query.data;
  const [index, setIndex] = useState(Number(slide) || 0);
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busyAction, setBusyAction] = useState<"edit" | "undo" | "share" | null>(null);
  const list = useRef<FlatList>(null);
  const slideWidth = width - 32;

  // Keep the current slide in range when an edit or undo changes how many there are.
  useEffect(() => {
    if (deck && index > deck.slides.length - 1) setIndex(Math.max(0, deck.slides.length - 1));
  }, [deck, index]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const busy = deckBusy(deck?.status);
  const current = deck?.slides[index];

  const submitEdit = async () => {
    const text = instruction.trim();
    if (!deck || !current || !text) return;
    setBusyAction("edit");
    try {
      await runRequest(getToken, `decks/${deck.id}/edits`, { instruction: text, slideIds: [current.id] });
      haptic.light();
      setEditing(false);
      setInstruction("");
      await client.invalidateQueries({ queryKey: deckKey(userId, deck.id) });
    } catch (error) {
      Alert.alert("Couldn’t change the slide", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusyAction(null);
    }
  };

  const undo = async () => {
    if (!deck) return;
    setBusyAction("undo");
    try {
      const result = await runRequest<{ deck: DeckView }>(getToken, `decks/${deck.id}/undo`, {});
      haptic.medium();
      client.setQueryData(deckKey(userId, deck.id), result.deck);
    } catch (error) {
      Alert.alert("Couldn’t undo", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusyAction(null);
    }
  };

  const share = async () => {
    if (!deck) return;
    setBusyAction("share");
    try {
      await shareDeck(getToken, deck);
    } catch (error) {
      Alert.alert("Couldn’t share the deck", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusyAction(null);
    }
  };

  if (!deck)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        {query.isError ? <Text style={{ color: colors.textSecondary }}>Couldn’t open this deck.</Text> : <ActivityIndicator />}
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={close}>
          <ChatIcon name="close" color={colors.text} size={22} />
        </Pressable>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>{deck.title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: "DMSans_500Medium" }}>
          {deck.slides.length ? `${index + 1} / ${deck.slides.length}` : ""}
        </Text>
      </View>

      {busy && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 12, backgroundColor: colors.surface }}>
          <WorkingDots color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{deck.status === "editing" ? "Updating the slides…" : "Still writing the slides…"}</Text>
        </View>
      )}
      {!busy && deck.error && <Text style={{ marginHorizontal: 16, marginBottom: 8, color: colors.textSecondary, fontSize: 13 }}>{deck.error}</Text>}

      <FlatList
        ref={list}
        data={deck.slides}
        horizontal
        pagingEnabled
        initialScrollIndex={Math.min(index, Math.max(0, deck.slides.length - 1))}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(event) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / width);
          if (next !== index) {
            haptic.selection();
            setIndex(next);
          }
        }}
        renderItem={({ item, index: i }) => (
          <ScrollView style={{ width }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 16 }}>
            <View style={{ borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
              <SlideView deck={deck} slide={item} index={i} total={deck.slides.length} width={slideWidth} />
            </View>
            {item.notes ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>SPEAKER NOTES</Text>
                <Text selectable style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}>{item.notes}</Text>
              </View>
            ) : null}
          </ScrollView>
        )}
      />

      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 10, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Action label="Change slide" icon="edit" disabled={busy || !current} onPress={() => setEditing(true)} colors={colors} />
        <Action label="Undo" disabled={busy || deck.version < 2 || busyAction === "undo"} loading={busyAction === "undo"} onPress={() => void undo()} colors={colors} />
        <Action label="PowerPoint" primary disabled={busy || busyAction === "share"} loading={busyAction === "share"} onPress={() => void share()} colors={colors} />
      </View>

      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={() => setEditing(false)} />
          <View style={{ padding: 20, paddingBottom: insets.bottom + 16, gap: 12, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface }}>
            <Text style={{ color: colors.text, fontSize: 17, fontFamily: "DMSans_600SemiBold" }}>Change slide {index + 1}</Text>
            <TextInput
              autoFocus
              multiline
              value={instruction}
              onChangeText={setInstruction}
              maxLength={2000}
              placeholder="Make it shorter, add a point about pricing…"
              placeholderTextColor={colors.textMuted}
              style={{ minHeight: 88, maxHeight: 180, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 16, textAlignVertical: "top" }}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!instruction.trim() || busyAction === "edit"}
              onPress={() => void submitEdit()}
              style={{ alignItems: "center", paddingVertical: 13, borderRadius: 14, backgroundColor: colors.primary, opacity: instruction.trim() ? 1 : 0.5 }}
            >
              {busyAction === "edit" ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>Change it</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Action({ label, icon, primary, disabled, loading, onPress, colors }: { label: string; icon?: "edit"; primary?: boolean; disabled?: boolean; loading?: boolean; onPress: () => void; colors: ReturnType<typeof useTheme>["colors"] }) {
  const foreground = primary ? colors.primaryForeground : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: primary ? colors.primary : "transparent", borderWidth: primary ? 0 : 1, borderColor: colors.border, opacity: disabled && !loading ? 0.45 : 1 }}
    >
      {loading ? <ActivityIndicator color={foreground} /> : icon ? <ChatIcon name={icon} color={foreground} size={16} /> : null}
      {!loading && <Text style={{ color: foreground, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>{label}</Text>}
    </Pressable>
  );
}
