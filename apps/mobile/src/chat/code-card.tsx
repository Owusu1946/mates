import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import { WorkingDots } from "./activity-line";
import { runRequest } from "./background-chat";
import { ChatIcon } from "./chat-icon";

type Code = NonNullable<WorkflowCard["code"]>;
const ORDER: Code["status"][] = ["queued", "cloning", "coding", "checking", "pushing", "done"];
const STEPS: { at: Code["status"]; label: string }[] = [
  { at: "cloning", label: "Setting up the computer" },
  { at: "coding", label: "Writing the code" },
  { at: "checking", label: "Running checks" },
  { at: "pushing", label: "Opening the pull request" },
];
const ACTIVE = ["queued", "cloning", "coding", "checking", "pushing"];
const GREEN = "#30A46C";
const LIVE_LINES = 4;

/** A job on the mates' computer, kept live by polling while it runs. */
export function CodeCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const initial = state.code;
  const [openCheck, setOpenCheck] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const live = useQuery({
    queryKey: ["code-run", userId, initial?.runId],
    enabled: !!initial,
    initialData: state,
    queryFn: async () => (await runRequest<{ card: WorkflowCard }>(getToken, `code-runs/${initial!.runId}`)).card,
    refetchInterval: (query) => (ACTIVE.includes(query.state.data?.code?.status ?? "done") ? 2_000 : false),
  });
  const code = live.data?.code ?? initial;
  if (!code) return null;
  const running = ACTIVE.includes(code.status);
  // Checks run between coding rounds, so "coding" after a check means the fix loop is going.
  const reached = ORDER.indexOf(code.status === "failed" || code.status === "cancelled" ? "queued" : code.status);

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

  return (
    <View style={{ marginVertical: 6, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>MATES’ COMPUTER</Text>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>{code.repo}</Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13 }}>{code.branch}</Text>
      </View>

      {code.status !== "done" && (
        <View style={{ gap: 8 }}>
          {STEPS.map((step) => {
            const index = ORDER.indexOf(step.at);
            const current = running && code.status === step.at;
            const finished = reached > index;
            if (!running && !finished) return null;
            return (
              <View key={step.at} style={{ flexDirection: "row", alignItems: "center", gap: 10, opacity: finished || current ? 1 : 0.45 }}>
                <View style={{ width: 18, alignItems: "center" }}>
                  {finished ? <ChatIcon name="check" color={GREEN} size={15} /> : current ? <WorkingDots color={colors.textMuted} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border }} />}
                </View>
                <Text style={{ color: colors.text, fontSize: 14 }}>{step.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      <ActivityFeed activity={code.activity ?? []} running={running} expanded={showLog} onToggle={() => setShowLog(!showLog)} />

      {code.checks.length > 0 && (
        <View style={{ gap: 6 }}>
          {code.checks.map((check) => {
            const open = openCheck === check.name;
            return (
              <Pressable key={check.name} accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpenCheck(open ? null : check.name)} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: check.passed ? GREEN : colors.error, fontSize: 14 }}>{check.passed ? "✓" : "✗"}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: "Menlo" }}>{check.command}</Text>
                </View>
                {open && check.output ? (
                  <Text selectable style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Menlo", padding: 10, borderRadius: 10, backgroundColor: colors.surfaceElevated }}>
                    {check.output.slice(-1_500)}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {code.pr && (
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            haptic.light();
            void WebBrowser.openBrowserAsync(code.pr!.url);
          }}
          style={({ pressed }) => ({ padding: 12, borderRadius: 14, gap: 4, backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontFamily: "DMSans_600SemiBold" }}>PR #{code.pr.number}</Text>
          <Text numberOfLines={2} style={{ color: colors.textSecondary, fontSize: 14 }}>{code.pr.title}</Text>
          <Text style={{ color: colors.text, fontSize: 14, fontFamily: "DMSans_600SemiBold", marginTop: 4 }}>Open pull request</Text>
        </Pressable>
      )}

      {code.status === "failed" && <Text style={{ color: colors.error, fontSize: 14, lineHeight: 20 }}>{code.error ?? "The run didn’t finish. Nothing was pushed."}</Text>}
      {code.status === "cancelled" && <Text style={{ color: colors.textMuted, fontSize: 14 }}>Stopped.</Text>}
      {!running && code.costUsd !== undefined && (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Model cost {code.costUsd < 0.01 ? "under $0.01" : `$${code.costUsd.toFixed(2)}`}</Text>
      )}

      {running && (
        <Pressable accessibilityRole="button" disabled={stopping} onPress={stop} hitSlop={8} style={{ alignSelf: "flex-start", opacity: stopping ? 0.5 : 1 }}>
          <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>{stopping ? "Stopping…" : "Stop"}</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * What the computer is doing, line by line. While it runs, the last few lines tick past with the
 * newest one highlighted; afterwards the whole log folds away behind a toggle.
 */
function ActivityFeed({ activity, running, expanded, onToggle }: { activity: { at: string; text: string }[]; running: boolean; expanded: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  if (!activity.length) return null;
  const mono = { fontFamily: "Menlo", fontSize: 12, lineHeight: 18 } as const;
  if (running)
    return (
      <View accessibilityLiveRegion="polite" style={{ padding: 10, borderRadius: 12, backgroundColor: colors.surfaceElevated, gap: 2, overflow: "hidden" }}>
        {activity.slice(-LIVE_LINES).map((line, index, shown) => {
          const latest = index === shown.length - 1;
          return (
            <Animated.View key={line.at + line.text} entering={FadeIn.duration(200)} layout={LinearTransition.duration(200)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text numberOfLines={1} style={[mono, { flexShrink: 1, color: latest ? colors.text : colors.textMuted }]}>
                {line.text}
              </Text>
              {latest && <WorkingDots color={colors.textMuted} />}
            </Animated.View>
          );
        })}
      </View>
    );
  return (
    <View style={{ gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} hitSlop={6} style={{ alignSelf: "flex-start" }}>
        <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>{expanded ? "Hide activity" : `Show activity (${activity.length})`}</Text>
      </Pressable>
      {expanded && (
        <View style={{ padding: 10, borderRadius: 12, backgroundColor: colors.surfaceElevated, gap: 2 }}>
          {activity.map((line) => (
            <Text key={line.at + line.text} selectable style={[mono, { color: colors.textSecondary }]}>
              {line.text}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
