import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChatIcon } from "./chat-icon";
import { createApiClient } from "../data/api";
import { useTheme } from "../theme/provider";
import { CardButton } from "./card-button";

/** The "Memory updated" chip on a reply, with undo for a memory Cooper just saved. */
export function MemoryCard({ state }: { state: WorkflowCard }) {
  const { colors, isDark } = useTheme();
  const { getToken } = useAuth();
  const router = useRouter();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const [undone, setUndone] = useState(false);
  const [busy, setBusy] = useState(false);
  const memory = state.memory;
  if (!memory) return null;
  const undo = async () => {
    setBusy(true);
    try {
      const response = await api.v1.memories[":id"].$delete({ param: { id: memory.id } });
      if (response.ok || response.status === 404) setUndone(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View
      accessibilityLabel={`${undone ? "Memory not saved" : state.label}: ${memory.text}`}
      style={{ alignSelf: "flex-start", maxWidth: "100%", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 6, marginVertical: 4 }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>{undone ? "Memory not saved" : state.label}</Text>
      <Text style={{ color: undone ? colors.textMuted : colors.text, fontSize: 15, lineHeight: 21, fontFamily: "DMSans_400Regular", textDecorationLine: undone ? "line-through" : "none" }}>
        {memory.text}
      </Text>
      <View style={{ flexDirection: "row", gap: 4, marginLeft: -8 }}>
        {memory.action === "saved" && !undone && (
          <CardButton label={busy ? "Undoing…" : "Undo"} variant="text" disabled={busy} onPress={() => void undo()} />
        )}
        <CardButton label="Manage" variant="text" onPress={() => router.push("/(app)/memory")} />
      </View>
    </View>
  );
}

/** Several memories saved at once (from "About you"): a quiet chip that opens Memory. */
export function MemoriesChip({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const router = useRouter();
  const count = state.memories?.count ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${state.label}: ${count} ${count === 1 ? "memory" : "memories"} saved. Open Memory`}
      onPress={() => router.push("/(app)/memory")}
      style={({ pressed }) => ({ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, marginVertical: 4, borderRadius: 14, backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.6 : 1 })}
    >
      <ChatIcon name="ideas" color={colors.textMuted} size={14} />
      <Text numberOfLines={1} style={{ color: colors.textMuted, fontFamily: "DMSans_500Medium", fontSize: 13 }}>{state.label}</Text>
    </Pressable>
  );
}
