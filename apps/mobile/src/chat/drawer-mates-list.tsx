import { plainPreview } from "../components/rich-text/markdown-text";
import { useAui, useAuiState } from "@assistant-ui/react-native";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ActionSheetIOS, Alert, FlatList, Platform, Pressable, RefreshControl, Text, View } from "react-native";
import { haptic } from "../haptics";
import { useChats, useMateActions, useMates, type ChatSummary } from "../mates/data";
import { GroupAvatar, MateAvatar } from "../mates/mate-avatar";
import { ChatIcon } from "./chat-icon";

type Colors = { foreground: string; mutedForeground: string; muted: string; border: string };
type Row = { type: "chat"; chat: ChatSummary } | { type: "earlier"; count: number };

const isPeople = (chat: ChatSummary) => chat.kind === "mate" || chat.kind === "group";
const nameOf = (chat: ChatSummary) => (chat.kind === "mate" ? chat.mate?.name ?? chat.title : chat.title);
const recency = (chat: ChatSummary) => Date.parse(chat.preview?.at ?? chat.updatedAt);

/** "14:05" today, "Yesterday", a weekday this week, otherwise "12 Nov". */
export function shortTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function previewLine(chat: ChatSummary) {
  if (!chat.preview) return chat.kind === "group" ? `${chat.members.length} mates` : "Say hello";
  const { from } = chat.preview;
  const text = plainPreview(chat.preview.text);
  if (from === "you") return `You: ${text}`;
  return chat.kind === "group" ? `${from}: ${text}` : text;
}

/**
 * Long-press menu for a mate or group: rename, edit details, or delete. Native on each platform:
 * an action sheet and text prompt on iOS; Android's dialog holds three buttons and has no text
 * prompt, so "Edit" there opens the profile, where the name is edited too.
 */
function useRowMenu(onNavigate: () => void) {
  const aui = useAui();
  const router = useRouter();
  const mates = useMates();
  const actions = useMateActions();
  const fail = (error: Error) => Alert.alert("Couldn’t update", error.message);
  // A deleted conversation that is open falls back to Cooper rather than a dead chat.
  const leave = (deletedChatId: string) => {
    const cooper = mates.data?.mates.find((m) => m.isDefault);
    if (cooper && aui.threadListItem.getState().remoteId === deletedChatId) void aui.threads.switchToThread(cooper.chatId);
  };
  return (chat: ChatSummary) => {
    const group = chat.kind === "group";
    const mateId = chat.mate?.id;
    const isDefault = !group && !!mates.data?.mates.find((m) => m.id === mateId)?.isDefault;
    const name = nameOf(chat);
    const profile = group ? `/group/${chat.id}` : `/mate/${mateId}`;
    const edit = () => {
      onNavigate();
      router.push(profile as never);
    };
    const rename = () =>
      Alert.prompt(
        `Rename ${name}`,
        undefined,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Save",
            onPress: (value?: string) => {
              const next = value?.trim();
              if (!next || next === name) return;
              if (group) actions.updateGroup.mutate({ chatId: chat.id, name: next }, { onError: fail });
              else if (mateId) actions.updateMate.mutate({ id: mateId, name: next }, { onError: fail });
            },
          },
        ],
        "plain-text",
        name,
      );
    const remove = () =>
      Alert.alert(
        group ? `Delete ${name}?` : `Remove ${name}?`,
        group ? "The group conversation and its mission are deleted. Your mates and their own chats stay." : "Your conversation with them is deleted too, and they leave any groups. This can’t be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: group ? "Delete" : "Remove",
            style: "destructive",
            onPress: () => {
              const handlers = { onSuccess: () => leave(chat.id), onError: fail };
              if (group) actions.deleteGroup.mutate(chat.id, handlers);
              else if (mateId) actions.deleteMate.mutate(mateId, handlers);
            },
          },
        ],
      );
    haptic.medium();
    if (Platform.OS === "ios") {
      const choices = [rename, edit, ...(isDefault ? [] : [remove])];
      const labels = ["Rename", "Edit details", ...(isDefault ? [] : [group ? "Delete group" : "Remove mate"]), "Cancel"];
      ActionSheetIOS.showActionSheetWithOptions(
        { title: name, options: labels, cancelButtonIndex: labels.length - 1, destructiveButtonIndex: isDefault ? undefined : 2 },
        (index) => choices[index]?.(),
      );
    } else {
      Alert.alert(name, undefined, [
        { text: "Edit", onPress: edit },
        ...(isDefault ? [] : [{ text: group ? "Delete" : "Remove", style: "destructive" as const, onPress: remove }]),
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  };
}

function ChatRow({ chat, active, colors, onPress, onLongPress }: { chat: ChatSummary; active: boolean; colors: Colors; onPress: () => void; onLongPress: () => void }) {
  const name = nameOf(chat);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open chat with ${name}`}
      accessibilityHint="Long press to rename or delete"
      accessibilityActions={[{ name: "longpress", label: "Rename or delete" }]}
      onAccessibilityAction={(event) => event.nativeEvent.actionName === "longpress" && onLongPress()}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 16, backgroundColor: pressed || active ? colors.muted : "transparent" })}
    >
      {chat.kind === "group" ? <GroupAvatar gradients={chat.members.map((m) => m.gradient)} shapes={chat.members.map((m) => m.shape)} size={46} /> : <MateAvatar gradient={chat.mate?.gradient} shape={chat.mate?.shape} size={46} still />}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontFamily: "DMSans_600SemiBold", fontSize: 16 }}>{name}</Text>
          {chat.preview && <Text style={{ color: colors.mutedForeground, fontFamily: "DMSans_400Regular", fontSize: 12 }}>{shortTime(chat.preview.at)}</Text>}
        </View>
        <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontFamily: "DMSans_400Regular", fontSize: 14 }}>{previewLine(chat)}</Text>
      </View>
    </Pressable>
  );
}

function EarlierRow({ chat, active, colors, onPress }: { chat: ChatSummary; active: boolean; colors: Colors; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${chat.title}`}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", paddingHorizontal: 6, borderRadius: 14, backgroundColor: pressed || active ? colors.muted : "transparent" })}
    >
      <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: "DMSans_400Regular", fontSize: 16 }}>{chat.title}</Text>
    </Pressable>
  );
}

/**
 * The sidebar's people: mates and groups by most recent message, then the user's earlier chats
 * from before mates existed. Reads its own query so it refreshes quietly whenever it opens.
 */
export function MatesList({ open, query, colors, onSelect }: { open: boolean; query: string; colors: Colors; onSelect: () => void }) {
  const aui = useAui();
  const chats = useChats();
  const currentId = useAuiState((state) => state.threadListItem.remoteId);
  const [showEarlier, setShowEarlier] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const { refetch } = chats;
  useEffect(() => {
    if (open) void refetch();
  }, [open, refetch]);

  const refreshFromPull = async () => {
    setPullRefreshing(true);
    try {
      await refetch();
    } finally {
      setPullRefreshing(false);
    }
  };

  const q = query.trim().toLowerCase();
  const matches = (chat: ChatSummary) => !q || `${nameOf(chat)} ${chat.preview?.text ?? ""}`.toLowerCase().includes(q);
  const all = (chats.data ?? []).filter(matches).sort((a, b) => recency(b) - recency(a));
  const people = all.filter(isPeople);
  const earlier = all.filter((chat) => !isPeople(chat));
  // A search shows every match; otherwise earlier chats stay folded away.
  const expanded = showEarlier || !!q;
  const rows: Row[] = [
    ...people.map((chat) => ({ type: "chat" as const, chat })),
    ...(earlier.length ? [{ type: "earlier" as const, count: earlier.length }] : []),
    ...(expanded ? earlier.map((chat) => ({ type: "chat" as const, chat })) : []),
  ];
  const openMenu = useRowMenu(onSelect);
  const openChat = (id: string) => {
    void aui.threads.switchToThread(id);
    onSelect();
  };

  if (!chats.data) {
    const retryable = chats.isError || chats.fetchStatus === "paused";
    const message = chats.isError
      ? "Couldn’t load your recent chats. Tap to retry."
      : chats.fetchStatus === "paused"
        ? "Waiting for a connection. Tap to retry."
        : "Loading your recent chats…";
    return (
      <Pressable
        accessibilityRole={retryable ? "button" : undefined}
        disabled={!retryable}
        onPress={() => void refetch()}
        style={{ paddingTop: 6 }}
      >
        <Text style={{ color: retryable ? colors.foreground : colors.mutedForeground, fontFamily: "DMSans_400Regular", fontSize: 15 }}>
          {message}
        </Text>
      </Pressable>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => (row.type === "chat" ? row.chat.id : "earlier")}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 14, gap: 2 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => void refreshFromPull()} />}
      ListEmptyComponent={<Text style={{ color: colors.mutedForeground, fontSize: 15, paddingTop: 6 }}>{q ? "No matches." : "No recent chats yet."}</Text>}
      renderItem={({ item }) =>
        item.type === "earlier" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setShowEarlier((value) => !value)}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 18, paddingBottom: 8, paddingHorizontal: 6 }}
          >
            <Text style={{ color: colors.foreground, fontFamily: "DMSans_600SemiBold", fontSize: 15 }}>Earlier chats · {item.count}</Text>
            <View style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}>
              <ChatIcon name="next" color={colors.mutedForeground} size={16} />
            </View>
          </Pressable>
        ) : isPeople(item.chat) ? (
          <ChatRow chat={item.chat} active={item.chat.id === currentId} colors={colors} onPress={() => openChat(item.chat.id)} onLongPress={() => openMenu(item.chat)} />
        ) : (
          <EarlierRow chat={item.chat} active={item.chat.id === currentId} colors={colors} onPress={() => openChat(item.chat.id)} />
        )
      }
    />
  );
}
