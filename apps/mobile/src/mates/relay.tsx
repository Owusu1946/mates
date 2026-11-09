import type { WorkflowCard } from "@expojet/api-contract";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { WorkingDots } from "../chat/activity-line";
import { useTheme } from "../theme/provider";
import { MateAvatar } from "./mate-avatar";

export type Status = NonNullable<WorkflowCard["handoff"]>["items"][number]["status"];

export function StatusPill({ status }: { status: Status }) {
  const { colors } = useTheme();
  const text = { queued: "Up next", working: "Working", review: "In review", changes: "Revising", done: "Done", waiting: "Needs you", failed: "Didn’t finish" }[status];
  const tint = status === "done" ? "#30A46C" : status === "failed" ? colors.error : status === "waiting" ? colors.text : colors.textMuted;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {(status === "working" || status === "review") && <WorkingDots color={colors.textMuted} />}
      <Text style={{ color: tint, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>{status === "done" ? `✓ ${text}` : text}</Text>
    </View>
  );
}

/**
 * The round's relay: the leader hands work out, then each mate's task with its live status,
 * joined by a line so it reads as work passing from one mate to the next.
 */
export function HandoffCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const handoff = state.handoff;
  if (!handoff) return null;
  return (
    <View
      accessibilityLabel={`${state.label}: ${handoff.items.map((i) => `${i.mate.name}, ${i.status}`).join("; ")}`}
      style={{ marginVertical: 8, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <MateAvatar gradient={handoff.from.gradient} shape={handoff.from.shape} size={22} still />
        <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>
          {handoff.round ? `ROUND ${handoff.round} · ` : ""}
          {handoff.from.name.toUpperCase()} HANDED OFF
        </Text>
      </View>
      {handoff.items.map((item, i) => {
        const last = i === handoff.items.length - 1;
        return (
          <View key={`${item.mate.id}-${i}`} style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ alignItems: "center" }}>
              <View style={{ opacity: item.status === "queued" ? 0.5 : 1 }}>
                <MateAvatar gradient={item.mate.gradient} shape={item.mate.shape} size={30} still />
              </View>
              {!last && <View style={{ flex: 1, width: 2, marginTop: 4, borderRadius: 1, backgroundColor: item.status === "done" ? "#30A46C" : colors.border }} />}
            </View>
            <View style={{ flex: 1, gap: 2, paddingBottom: last ? 0 : 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontFamily: "DMSans_600SemiBold" }}>{item.mate.name}</Text>
                <StatusPill status={item.status} />
              </View>
              <Text numberOfLines={3} style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 19 }}>
                {item.task || "Asked directly"}
              </Text>
              {item.status === "working" && item.step ? (
                <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13 }}>
                  {item.step}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** A note a mate just wrote, so progress shows in the chat; opens the team's notes. */
export function NoteChip({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const router = useRouter();
  const note = state.note;
  if (!note) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${note.author} ${note.version > 1 ? "updated" : "wrote"} the note ${note.title}. Open notes`}
      onPress={() => router.push(`/mission/${encodeURIComponent(note.chatId)}` as never)}
      style={({ pressed }) => ({
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginVertical: 4,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
      })}
    >
      <Text style={{ fontSize: 14 }}>📝</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
        {note.author} {note.version > 1 ? "updated" : "wrote"} <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold" }}>“{note.title}”</Text>
        {note.version > 1 ? ` · v${note.version}` : ""}
      </Text>
    </Pressable>
  );
}
