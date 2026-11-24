import { useAui, useAuiState } from "@assistant-ui/react-native";
import type { WorkflowCard } from "@expojet/api-contract";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { AppLogo } from "../connections/app-connection";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import { ChatIcon } from "./chat-icon";
import { Pill } from "./plan-card";
import { ShimmerText } from "./shimmer-text";

const GREEN = "#30A46C";
type Choice = "allow" | "always" | "decline";
const ANSWER: Record<Choice, string> = { allow: "approve", always: "always", decline: "decline" };

/**
 * A mate asking before it acts: money and permanent deletes always ask, and while you're away so
 * does anything that reaches other people. Allow runs it once, Always allow remembers it for that
 * app and person (never for money), Not now leaves it. The card keeps your answer afterwards.
 */
export function ActionApproval({ state, preview = false }: { state: WorkflowCard; preview?: boolean }) {
  const aui = useAui();
  const running = useAuiState((s) => s.thread.isRunning);
  const { colors } = useTheme();
  const [picked, setPicked] = useState<Choice | null>(null);
  const [expanded, setExpanded] = useState(false);
  const approval = state.approval;
  const choice = approval?.choice ?? picked;
  const settled = state.phase === "done" || state.phase === "error";
  const app = state.name ?? "the app";
  const who = approval?.targets[0];

  const answer = (value: Choice) => {
    if (preview) return;
    if (value === "decline") haptic.selection();
    else haptic.success();
    setPicked(value);
    aui.message.reload({ runConfig: { custom: { resumeRunId: state.resumeRunId, choice: ANSWER[value] } } });
  };

  const status = !choice
    ? null
    : !settled
      ? { text: choice === "decline" ? "Leaving it…" : "Doing it now…", pending: true }
      : choice === "decline"
        ? { text: "Not now. Nothing was changed." }
        : state.phase === "error"
          ? { text: `Allowed, but it didn't go through. Check ${app}.`, failed: true }
          : choice === "always"
            ? { text: `Done. ${approval?.mate ?? "Your mate"} won't ask again for ${who ? who : app}.`, done: true }
            : { text: "Done.", done: true };

  return (
    <Animated.View style={{ marginVertical: 4, padding: 14, gap: 12, borderRadius: 18, borderCurve: "continuous", backgroundColor: colors.surface }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {state.name ? <AppLogo name={state.name} logo={state.logo} size={30} /> : null}
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ color: colors.textMuted, fontFamily: "DMSans_500Medium", fontSize: 12.5 }}>
            {approval?.mate ?? "Your mate"} {settled ? "asked to" : "wants to"}
            {approval?.unattended ? " · while you were away" : ""}
          </Text>
          <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 15.5, lineHeight: 21 }}>{state.label}</Text>
        </View>
      </View>

      {/* Why it was held, when the outbound check stopped an action that would have run. */}
      {!!approval?.reason && !settled && (
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, borderCurve: "continuous", backgroundColor: colors.background }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 7, backgroundColor: "#F5A524" }} />
          <Text style={{ flex: 1, color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 13.5, lineHeight: 19 }}>{approval.reason}</Text>
        </View>
      )}

      {!!state.approvalFields?.length && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Show less" : "Show the whole message"}
          onPress={() => setExpanded((value) => !value)}
          style={{ gap: 7 }}
        >
          {state.approvalFields.map((field) => {
            const long = field.label === "Message";
            return (
              <View key={field.label} style={{ flexDirection: "row", gap: 10 }}>
                <Text style={{ width: 62, color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 19 }}>{field.label}</Text>
                <Text selectable numberOfLines={long && !expanded ? 3 : undefined} style={{ flex: 1, color: colors.text, fontFamily: "DMSans_400Regular", fontSize: 14, lineHeight: 19 }}>
                  {field.value}
                </Text>
              </View>
            );
          })}
        </Pressable>
      )}

      {!!approval?.more?.length && (
        <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 18 }}>
          Also: {approval.more.join(" · ")}
        </Text>
      )}

      {status ? (
        <Animated.View entering={FadeIn.duration(160)} style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          {status.done && <ChatIcon name="check" color={GREEN} size={15} />}
          {status.failed && <ChatIcon name="close" color={colors.error} size={15} />}
          {status.pending ? (
            <ShimmerText text={status.text} active style={{ fontFamily: "DMSans_500Medium", fontSize: 13.5 }} />
          ) : (
            <Text style={{ flex: 1, color: status.failed ? colors.error : colors.textSecondary, fontFamily: "DMSans_500Medium", fontSize: 13.5, lineHeight: 18 }}>{status.text}</Text>
          )}
        </Animated.View>
      ) : (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pill label="Allow" strong disabled={preview || running} onPress={() => answer("allow")} />
            {approval?.canAlways !== false && <Pill label="Always allow" disabled={preview || running} onPress={() => answer("always")} />}
            <View style={{ flex: 1 }} />
            <Pressable accessibilityRole="button" disabled={preview || running} hitSlop={8} onPress={() => answer("decline")} style={({ pressed }) => ({ paddingHorizontal: 4, opacity: preview || running ? 0.4 : pressed ? 0.5 : 1 })}>
              <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_500Medium", fontSize: 13.5 }}>Not now</Text>
            </Pressable>
          </View>
          {approval?.category === "spend" && (
            <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 12.5 }}>Payments always need your OK.</Text>
          )}
        </View>
      )}
    </Animated.View>
  );
}
