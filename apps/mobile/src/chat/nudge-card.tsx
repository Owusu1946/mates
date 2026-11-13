import { useAui } from "@assistant-ui/react-native";
import type { WorkflowCard } from "@expojet/api-contract";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { haptic } from "../haptics";
import { useHabitActions, useHabits, type NudgeAction } from "../habits/use-habits";
import { useTheme } from "../theme/provider";
import { CardButton } from "./card-button";
import { ChatIcon } from "./chat-icon";

const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium" };

const DONE: Record<string, string> = {
  handled: "On it",
  skipped: "Skipped for today",
  stopped: "Won’t suggest this again",
  automated: "Done automatically from now on",
};

/**
 * A mate offering to handle something the user usually does. The offer itself is the message
 * text above; this adds the answers, set like a reply rather than a boxed card.
 */
export function NudgeCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const aui = useAui();
  const actions = useHabitActions();
  const habits = useHabits();
  const nudge = state.nudge;
  const [busy, setBusy] = useState<NudgeAction | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!nudge) return null;
  const outcome = answered ?? nudge.outcome;
  // "Make it automatic" also shows after handling, once it's been handled often enough.
  const live = habits.data?.habits.find((h) => h.id === nudge.habitId);
  const canAutomate = (live?.canAutomate ?? nudge.canAutomate) && !live?.automatic && (outcome === null || outcome === "handled");

  const act = async (action: NudgeAction) => {
    setBusy(action);
    setError(null);
    try {
      const result = await actions.nudge(nudge.nudgeId, action);
      setAnswered(result.outcome);
      haptic.success();
      if (action === "handle" && result.prompt) {
        aui.composer.setText(result.prompt);
        aui.composer.send();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn’t work. Try again.");
      haptic.error();
    } finally {
      setBusy(null);
    }
  };

  return (
    <View testID="nudge-card" style={{ gap: 8, paddingVertical: 2 }}>
      {outcome ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ChatIcon name={outcome === "stopped" ? "close" : "check"} color={colors.textMuted} size={14} />
          <Text style={{ color: colors.textMuted, fontFamily: font.medium, fontSize: 13 }}>{DONE[outcome] ?? "Answered"}</Text>
        </View>
      ) : null}
      {!outcome && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <CardButton label={busy === "handle" ? "Starting…" : "Handle it"} disabled={!!busy} onPress={() => void act("handle")} />
          <CardButton label={busy === "skip" ? "Skipping…" : "Not today"} variant="outlined" disabled={!!busy} onPress={() => void act("skip")} />
          <CardButton label="Stop suggesting" variant="text" disabled={!!busy} onPress={() => void act("stop")} />
        </View>
      )}
      {canAutomate && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: -8 }}>
          <CardButton label={busy === "automate" ? "Setting up…" : "Make it automatic"} variant="text" disabled={!!busy} onPress={() => void act("automate")} />
        </View>
      )}
      <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 12 }} onPress={() => router.push("/noticed")} accessibilityRole="link">
        {nudge.when} · Why am I seeing this?
      </Text>
      {error && <Text style={{ color: colors.error, fontSize: 13 }}>{error}</Text>}
    </View>
  );
}
