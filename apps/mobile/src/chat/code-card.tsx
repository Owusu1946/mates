import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import { runRequest } from "./background-chat";
import { ChatIcon } from "./chat-icon";
import { ACTIVE, headlineOf, stepsOf, type Step } from "./code-steps";
import { ShimmerText } from "./shimmer-text";

const GREEN = "#30A46C";
/** Activity lines shown per step before "+N more". */
const STEP_LINES = 6;

/**
 * A job on the mates' computer, kept live by polling while it runs. No card: one line says what it's
 * doing right now, in a brushed-metal shimmer (like ChatGPT's "Thinking"), and unfolds into the
 * steps, each with what the computer did in it. When it ends, the line says how.
 */
export function CodeCard({ state }: { state: WorkflowCard }) {
  const { colors, isDark } = useTheme();
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const initial = state.code;
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const live = useQuery({
    queryKey: ["code-run", userId, initial?.runId],
    enabled: !!initial,
    initialData: state,
    queryFn: async () => (await runRequest<{ card: WorkflowCard }>(getToken, `code-runs/${initial!.runId}`)).card,
    refetchInterval: (query) => (ACTIVE.includes(query.state.data?.code?.status ?? "done") ? 2_000 : false),
    // A finished run never changes, so a card scrolled back into view doesn't fetch it again.
    staleTime: (query) => (ACTIVE.includes(query.state.data?.code?.status ?? "done") ? 0 : Infinity),
  });
  const code = live.data?.code ?? initial;
  if (!code) return null;
  const running = ACTIVE.includes(code.status);
  const headline = headlineOf(code);

  const stop = () =>
    Alert.alert("Stop this run?", "Nothing more will be pushed. Anything already on the branch stays.", [
      { text: "Keep going", style: "cancel" },
      {
        text: "Stop",
        style: "destructive",
        onPress: async () => {
          setStopping(true);
          try {
            await runRequest(getToken, `code-runs/${code.runId}/cancel`, {});
            await client.invalidateQueries({ queryKey: ["code-run", userId, code.runId] });
          } catch (error) {
            Alert.alert("Couldn’t stop it", error instanceof Error ? error.message : "Try again.");
          } finally {
            setStopping(false);
          }
        },
      },
    ]);
  const openPr = () => {
    if (!code.pr) return;
    haptic.light();
    void WebBrowser.openBrowserAsync(code.pr.url);
  };
  const toggle = () => {
    haptic.selection();
    setOpen((value) => !value);
  };

  const lineStyle = { fontFamily: "DMSans_500Medium", fontSize: 14.5, letterSpacing: 0.1 } as const;
  return (
    <Animated.View style={{ marginVertical: 8, gap: 10, ...(!running && code.pr ? { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface } : {}) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${headline}. ${open ? "Hide" : "Show"} steps`}
          accessibilityLiveRegion={running ? "polite" : "none"}
          onPress={toggle}
          hitSlop={6}
          style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: 7, minHeight: 26, opacity: pressed ? 0.6 : 1 })}
        >
          {!running && <EndIcon status={code.status} />}
          {running ? (
            <ShimmerText text={headline} active style={lineStyle} />
          ) : (
            <Text numberOfLines={1} style={[lineStyle, { flexShrink: 1, color: code.status === "failed" ? colors.error : code.status === "cancelled" ? colors.textMuted : colors.text }]}>
              {headline}
            </Text>
          )}
          <Chevron open={open} />
        </Pressable>
        {running && (
          <Pressable accessibilityRole="button" accessibilityLabel="Stop this run" disabled={stopping} onPress={stop} hitSlop={8} style={({ pressed }) => ({ opacity: stopping ? 0.4 : pressed ? 0.5 : 1 })}>
            <Text style={{ color: colors.textMuted, fontFamily: "DMSans_600SemiBold", fontSize: 13.5 }}>{stopping ? "Stopping…" : "Stop"}</Text>
          </Pressable>
        )}
        {!running && code.pr && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open pull request #${code.pr.number}`}
            onPress={openPr}
            style={({ pressed }) => ({ height: 30, paddingHorizontal: 13, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.text, opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
          >
            <Text style={{ color: colors.background, fontFamily: "DMSans_600SemiBold", fontSize: 13 }}>Review PR</Text>
          </Pressable>
        )}
      </View>

      <Text numberOfLines={1} style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 12.5 }}>
        {code.repo} · {code.branch}
      </Text>
      {!running && code.pr && (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 17, lineHeight: 23 }}>{code.pr.title}</Text>
          <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_500Medium", fontSize: 12 }}>
            {code.status === "failed" ? "Run failed" : code.status === "cancelled" ? "Run stopped" : code.pr.draft ? "Draft pull request" : code.checks.some(check => !check.passed) ? "Checks need attention" : "Ready for review"}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {code.pr.files !== undefined && <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{code.pr.files} files changed</Text>}
            {code.pr.additions !== undefined && <Text accessibilityLabel={`${code.pr.additions} additions`} style={{ color: isDark ? "#6ee7a0" : "#18733c", fontSize: 13, fontVariant: ["tabular-nums"] }}>+{code.pr.additions}</Text>}
            {code.pr.deletions !== undefined && <Text accessibilityLabel={`${code.pr.deletions} deletions`} style={{ color: isDark ? "#fda4af" : "#b42335", fontSize: 13, fontVariant: ["tabular-nums"] }}>−{code.pr.deletions}</Text>}
          </View>
          {!!code.checks.length && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{code.checks.map((check, index) => <Text key={check.command + index} style={{ color: check.passed ? (isDark ? "#6ee7a0" : "#18733c") : colors.error, fontSize: 12 }}>{check.passed ? "✓" : "✕"} {check.name}</Text>)}</View>}
        </View>
      )}
      {code.status === "failed" && <Text style={{ color: colors.error, fontFamily: "DMSans_400Regular", fontSize: 13.5, lineHeight: 19 }}>{code.error ?? "The run didn’t finish. Nothing was pushed."}</Text>}

      {open && (
        <Animated.View entering={FadeIn.duration(180)} style={{ marginTop: 6, paddingLeft: 2, gap: 10 }}>
          {stepsOf(code).map((step) => (
            <StepRow key={step.id} step={step} checks={step.id === "checks" ? code.checks : []} />
          ))}
          {code.pr && !running && (
            <Pressable accessibilityRole="link" onPress={openPr} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Text numberOfLines={2} style={{ color: colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 13.5, lineHeight: 19 }}>
                PR #{code.pr.number}: {code.pr.title}
              </Text>
            </Pressable>
          )}
          {/* Already failing before the change, diff warnings, a failed install or running out of time. */}
          {code.notes?.filter((note) => note.kind !== "still_failing").map((note) => (
            <Text key={note.kind + note.text} style={{ color: note.kind === "warning" ? colors.error : colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 18 }}>
              {note.kind === "warning" ? "⚠️ " : note.kind === "out_of_time" ? "⏱️ " : "ℹ️ "}
              {note.text.replace(/`/g, "")}
            </Text>
          ))}
          {!running && code.costUsd !== undefined && (
            <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 12 }}>Model cost {code.costUsd < 0.01 ? "under $0.01" : `$${code.costUsd.toFixed(2)}`}</Text>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** How a finished run ended: a green check, a cross, or a muted stop mark. */
function EndIcon({ status }: { status: string }) {
  const { colors } = useTheme();
  if (status === "done") return <ChatIcon name="check" color={GREEN} size={16} />;
  if (status === "failed") return <ChatIcon name="close" color={colors.error} size={15} />;
  return <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.textMuted, marginHorizontal: 3 }} />;
}

/** Points right when folded, down when open. */
function Chevron({ open }: { open: boolean }) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? "0deg" : "-90deg", { duration: 180 }) }] }));
  return (
    <Animated.View style={style}>
      <ChatIcon name="chevronDown" color={colors.textMuted} size={15} />
    </Animated.View>
  );
}

/** One step: its mark and label, then what the computer did in it (and, for checks, the results). */
function StepRow({ step, checks }: { step: Step; checks: NonNullable<WorkflowCard["code"]>["checks"] }) {
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  const [openCheck, setOpenCheck] = useState<string | null>(null);
  const muted = step.state === "todo";
  const lines = step.id === "checks" ? [] : all ? step.lines : step.lines.slice(-STEP_LINES);
  const hidden = step.id === "checks" ? 0 : step.lines.length - lines.length;
  const mono = { fontFamily: "Menlo", fontSize: 12, lineHeight: 18 } as const;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <View style={{ width: 16, alignItems: "center" }}>
          <StepMark state={step.state} />
        </View>
        {step.state === "current" ? (
          <ShimmerText text={step.label} active style={{ fontFamily: "DMSans_500Medium", fontSize: 13.5 }} />
        ) : (
          <Text style={{ color: muted ? colors.textMuted : step.state === "failed" ? colors.error : colors.text, fontFamily: "DMSans_500Medium", fontSize: 13.5, opacity: muted ? 0.7 : 1 }}>{step.label}</Text>
        )}
      </View>
      {(lines.length > 0 || checks.length > 0) && (
        // A thin rule ties the step's lines to it, like a timeline.
        <View style={{ marginLeft: 7.5, paddingLeft: 16.5, borderLeftWidth: 1, borderLeftColor: colors.border, gap: 3 }}>
          {hidden > 0 && (
            <Pressable accessibilityRole="button" hitSlop={4} onPress={() => setAll(true)}>
              <Text style={{ color: colors.textMuted, fontFamily: "DMSans_500Medium", fontSize: 12 }}>+{hidden} earlier</Text>
            </Pressable>
          )}
          {lines.map((line, i) => (
            <Text key={i} numberOfLines={1} style={[mono, { color: colors.textSecondary }]}>
              {line}
            </Text>
          ))}
          {checks.map((check) => {
            const shown = openCheck === check.name;
            return (
              <Pressable key={check.name} accessibilityRole="button" accessibilityState={{ expanded: shown }} onPress={() => setOpenCheck(shown ? null : check.name)} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Text style={{ color: check.passed ? GREEN : colors.error, fontSize: 13 }}>{check.passed ? "✓" : "✗"}</Text>
                  <Text style={[mono, { color: colors.textSecondary }]}>{check.command}</Text>
                </View>
                {shown && check.output ? (
                  <Text selectable style={[mono, { color: colors.textSecondary, padding: 10, borderRadius: 10, backgroundColor: colors.surfaceElevated }]}>
                    {check.output.slice(-1_500)}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function StepMark({ state }: { state: Step["state"] }) {
  const { colors } = useTheme();
  if (state === "done") return <ChatIcon name="check" color={GREEN} size={14} />;
  if (state === "failed") return <ChatIcon name="close" color={colors.error} size={13} />;
  if (state === "stopped") return <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.textMuted }} />;
  if (state === "current") return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.text }} />;
  return <View style={{ width: 7, height: 7, borderRadius: 3.5, borderWidth: 1, borderColor: colors.textMuted }} />;
}
