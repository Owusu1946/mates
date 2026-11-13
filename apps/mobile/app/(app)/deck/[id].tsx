import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
        <RoundButton icon="close" label="Close" onPress={close} colors={colors} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>{deck.title}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_400Regular" }}>
            {busy ? (deck.status === "editing" ? "Updating slides…" : "Writing slides…") : deck.slides.length ? `${index + 1} of ${deck.slides.length}` : ""}
          </Text>
        </View>
        <RoundButton icon="share" label="Share as PowerPoint" disabled={busy} loading={busyAction === "share"} onPress={() => void share()} colors={colors} />
      </View>

      {!busy && deck.error && <Text style={{ marginHorizontal: 20, marginTop: 4, color: colors.textSecondary, fontSize: 13, fontFamily: "DMSans_400Regular" }}>{deck.error}</Text>}

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
          <ScrollView style={{ width }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 18 }}>
            <View style={{ borderRadius: 14, borderCurve: "continuous", overflow: "hidden", opacity: busy ? 0.6 : 1 }}>
              <SlideView deck={deck} index={i} width={slideWidth} />
            </View>
            {deck.slides.length > 1 && (
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
                {deck.slides.map((s, dot) => (
                  <View key={s.id} style={{ width: dot === i ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: dot === i ? colors.text : colors.border }} />
                ))}
              </View>
            )}
            {item.notes ? (
              <View style={{ gap: 6, paddingHorizontal: 4 }}>
                <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>Speaker notes</Text>
                <Text selectable style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 23, fontFamily: "DMSans_400Regular" }}>{item.notes}</Text>
              </View>
            ) : null}
          </ScrollView>
        )}
      />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Change slide ${index + 1}`}
          disabled={busy || !current}
          onPress={() => setEditing(true)}
          style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, height: 48, paddingHorizontal: 18, borderRadius: 24, backgroundColor: colors.surface, opacity: busy ? 0.5 : pressed ? 0.7 : 1 })}
        >
          <ChatIcon name="edit" color={colors.textMuted} size={18} />
          <Text style={{ color: colors.textMuted, fontSize: 16, fontFamily: "DMSans_400Regular" }}>Change this slide…</Text>
        </Pressable>
        <RoundButton icon="undo" label="Undo the last change" size={48} disabled={busy || deck.version < 2} loading={busyAction === "undo"} onPress={() => void undo()} colors={colors} />
      </View>

      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.25)" }} onPress={() => setEditing(false)} />
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 12, gap: 12, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background }}>
            <View style={{ alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
            <Text style={{ color: colors.text, fontSize: 16, fontFamily: "DMSans_600SemiBold", paddingHorizontal: 4 }}>Change slide {index + 1}</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 6, paddingLeft: 16, borderRadius: 24, backgroundColor: colors.surface }}>
              <TextInput
                autoFocus
                multiline
                value={instruction}
                onChangeText={setInstruction}
                maxLength={2000}
                placeholder="Make it shorter, add a point about pricing…"
                placeholderTextColor={colors.textMuted}
                style={{ flex: 1, minHeight: 36, maxHeight: 140, paddingVertical: 8, color: colors.text, fontSize: 16, fontFamily: "DMSans_400Regular", textAlignVertical: "top" }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change it"
                disabled={!instruction.trim() || busyAction === "edit"}
                onPress={() => void submitEdit()}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.text, opacity: instruction.trim() ? 1 : 0.3 }}
              >
                {busyAction === "edit" ? <ActivityIndicator size="small" color={colors.background} /> : <ChatIcon name="send" color={colors.background} size={16} />}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/** A quiet round icon button: the viewer's only button style. */
function RoundButton({ icon, label, size = 36, disabled, loading, onPress, colors }: { icon: "close" | "share" | "undo"; label: string; size?: number; disabled?: boolean; loading?: boolean; onPress: () => void; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}
    >
      {loading ? <ActivityIndicator size="small" /> : <ChatIcon name={icon} color={colors.text} size={size > 40 ? 20 : 18} />}
    </Pressable>
  );
}
