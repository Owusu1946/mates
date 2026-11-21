import { useAuth } from "@clerk/expo";
import { useAui, useAuiState } from "@assistant-ui/react-native";
import type { WorkflowCard } from "@expojet/api-contract";
import { useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { AppLogo } from "../connections/app-connection";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import { runRequest } from "./background-chat";
import { ChatIcon } from "./chat-icon";
import { doneHeadline, planRows, type Action, type Row } from "./plan-rows";
import { ShimmerText } from "./shimmer-text";

const GREEN = "#30A46C";
type Undone = Record<string, "busy" | "done" | "failed">;

/**
 * What a mate is about to do (one approval for the whole plan) or has done, without a box: a
 * summary line, then one compact row per action with its app's logo and quiet Open and Undo links.
 * Repeated finished actions fold into one row. Unticked actions are skipped; the server runs the
 * stored plan, so only the chosen ids travel back, never the actions themselves.
 */
export function PlanCard({ state }: { state: WorkflowCard }) {
  const aui = useAui();
  const running = useAuiState((s) => s.thread.isRunning);
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const plan = state.plan;
  const [selected, setSelected] = useState(() => new Set(plan?.actions.map((a) => a.id)));
  const [answered, setAnswered] = useState<"approved" | "declined" | null>(null);
  const [undone, setUndone] = useState<Undone>({});
  const [open, setOpen] = useState(true);
  const zone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  if (!plan) return null;

  const reviewing = state.phase === "waiting" && !answered;
  const working = state.phase === "running" || (answered === "approved" && state.phase === "waiting");
  const finished = state.phase === "done" || state.phase === "error";
  const declined = state.label === "Plan declined" || answered === "declined";
  const rows = planRows(plan.actions, { group: finished && !declined, zone });

  const undo = async (action: Action) => {
    if (!action.undo || undone[action.id] === "busy" || undone[action.id] === "done") return;
    setUndone((current) => ({ ...current, [action.id]: "busy" }));
    try {
      await runRequest(getToken, action.undo.kind === "reminder" ? `reminders/${action.undo.id}/cancel` : `undo/${action.undo.id}`, {});
      setUndone((current) => ({ ...current, [action.id]: "done" }));
    } catch {
      setUndone((current) => ({ ...current, [action.id]: "failed" }));
    }
  };
  const answer = (choice: string, outcome: "approved" | "declined") => {
    haptic.light();
    setAnswered(outcome);
    aui.message.reload({ runConfig: { custom: { resumeRunId: state.resumeRunId, choice } } });
  };
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const headline = declined ? "Plan declined" : working ? "Working on it…" : finished ? doneHeadline(plan.actions) : state.label;
  const failedSome = finished && plan.actions.some((a) => a.status === "failed");
  const lineStyle = { fontFamily: "DMSans_500Medium", fontSize: 14.5, letterSpacing: 0.1 } as const;

  return (
    <Animated.View style={{ marginVertical: 4, gap: 8 }}>
      {/* The summary line: what's proposed, happening, or done. Finished, it folds the rows away. */}
      <Pressable
        accessibilityRole={finished ? "button" : "header"}
        accessibilityState={finished ? { expanded: open } : undefined}
        disabled={!finished}
        onPress={() => {
          haptic.selection();
          setOpen((value) => !value);
        }}
        hitSlop={6}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", opacity: pressed ? 0.6 : 1 })}
      >
        {finished && !declined && <ChatIcon name={failedSome ? "close" : "check"} color={failedSome ? colors.error : GREEN} size={16} />}
        {working ? (
          <ShimmerText text={headline} active style={lineStyle} />
        ) : (
          <Text style={[lineStyle, { color: declined ? colors.textMuted : reviewing ? colors.textMuted : colors.text, fontSize: reviewing ? 13 : 14.5 }]}>{headline}</Text>
        )}
        {finished && !declined && <Chevron open={open} />}
      </Pressable>
      {reviewing && !!plan.summary && <Text style={{ color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 15.5, lineHeight: 22 }}>{plan.summary}</Text>}

      {(open || !finished) && !declined && (
        <Animated.View entering={FadeIn.duration(160)} style={{ gap: 12 }}>
          {rows.map((row) => (
            <ActionRow key={row.key} row={row} reviewing={reviewing} selected={selected} onToggle={toggle} undone={undone} onUndo={undo} zone={zone} />
          ))}
        </Animated.View>
      )}

      {reviewing && (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <Pill label={selected.size === plan.actions.length ? "Approve" : `Approve ${selected.size}`} strong disabled={running || selected.size === 0} onPress={() => answer(`approve:${[...selected].join(",")}`, "approved")} />
          <Pill label="Not now" disabled={running} onPress={() => answer("decline", "declined")} />
        </View>
      )}
      {declined && <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13.5 }}>Nothing was changed.</Text>}
    </Animated.View>
  );
}

/** One action, or a run of the same action folded into one row that unfolds. */
function ActionRow({ row, reviewing, selected, onToggle, undone, onUndo, zone }: { row: Row; reviewing: boolean; selected: Set<string>; onToggle: (id: string) => void; undone: Undone; onUndo: (action: Action) => void; zone: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const first = row.actions[0]!;
  const group = row.actions.length > 1;
  const on = selected.has(first.id);
  const allUndone = row.actions.every((a) => undone[a.id] === "done");
  const undoable = row.actions.filter((a) => a.undo && a.status === "done" && undone[a.id] !== "done");
  const busy = row.actions.some((a) => undone[a.id] === "busy");
  const failedUndo = row.actions.some((a) => undone[a.id] === "failed");
  const link = !group ? first.links?.[0] : undefined;
  const dim = (reviewing && !on) || first.status === "skipped";

  const body = (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, opacity: dim ? 0.5 : 1 }}>
      {reviewing ? (
        <View style={{ width: 20, height: 20, marginTop: 1, borderRadius: 6, borderWidth: 1.5, borderColor: on ? colors.text : colors.border, backgroundColor: on ? colors.text : "transparent", alignItems: "center", justifyContent: "center" }}>
          {on && <ChatIcon name="check" color={colors.background} size={13} />}
        </View>
      ) : null}
      <View style={{ width: 20, alignItems: "center", marginTop: 1 }}>
        {first.kind === "app" && first.app ? <AppLogo name={first.app} logo={first.logo} size={20} /> : <ChatIcon name="tasks" color={colors.textSecondary} size={18} />}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={2} style={{ color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 14.5, lineHeight: 20, textDecorationLine: allUndone ? "line-through" : "none" }}>
          {row.primary}
        </Text>
        {first.status === "failed" && first.error ? (
          <Text numberOfLines={2} style={{ color: colors.error, fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 18 }}>{first.error}</Text>
        ) : row.secondary ? (
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 18 }}>{row.secondary}</Text>
        ) : null}
        {failedUndo && <Text style={{ color: colors.error, fontFamily: "DMSans_400Regular", fontSize: 12.5 }}>Couldn’t undo. Check the app directly.</Text>}
      </View>
      {/* Quiet actions on the right: status while it runs, Open and Undo once done. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 1 }}>
        {first.status === "running" && <ActivityIndicator size="small" color={colors.textMuted} />}
        {first.status === "skipped" && <Text style={{ color: colors.textMuted, fontFamily: "DMSans_500Medium", fontSize: 12.5 }}>Skipped</Text>}
        {allUndone ? (
          <Text style={{ color: colors.textMuted, fontFamily: "DMSans_500Medium", fontSize: 12.5 }}>Undone</Text>
        ) : (
          <>
            {link && <TextLink label="Open" onPress={() => void Linking.openURL(link.url)} />}
            {undoable.length > 0 && <TextLink label={busy ? "Undoing…" : "Undo"} muted disabled={busy} onPress={() => undoable.forEach((a) => onUndo(a))} />}
            {group && <Chevron open={open} />}
          </>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ gap: 8 }}>
      {reviewing ? (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={row.primary} onPress={() => onToggle(first.id)}>
          {body}
        </Pressable>
      ) : group ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${row.primary}. ${open ? "Hide" : "Show"} each`} onPress={() => setOpen((value) => !value)}>
          {body}
        </Pressable>
      ) : (
        body
      )}
      {group && open && (
        // Each one in the group, with its own Open and Undo.
        <Animated.View entering={FadeIn.duration(160)} style={{ marginLeft: 9.5, paddingLeft: 20.5, borderLeftWidth: 1, borderLeftColor: colors.border, gap: 8 }}>
          {row.actions.map((action) => {
            const when = action.details.find((d) => d.label === "When")?.value;
            const struck = undone[action.id] === "done";
            return (
              <View key={action.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Text numberOfLines={1} style={{ flex: 1, color: colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 13.5, textDecorationLine: struck ? "line-through" : "none" }}>
                  {(when ? when.replace(` (${zone})`, "") : null) ?? action.title}
                </Text>
                {struck ? (
                  <Text style={{ color: colors.textMuted, fontFamily: "DMSans_500Medium", fontSize: 12.5 }}>Undone</Text>
                ) : (
                  <>
                    {action.links?.[0] && <TextLink label="Open" onPress={() => void Linking.openURL(action.links![0]!.url)} />}
                    {action.undo && action.status === "done" && <TextLink label={undone[action.id] === "busy" ? "Undoing…" : "Undo"} muted disabled={undone[action.id] === "busy"} onPress={() => onUndo(action)} />}
                  </>
                )}
              </View>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}

function TextLink({ label, muted, disabled, onPress }: { label: string; muted?: boolean; disabled?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" hitSlop={8} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.5 : 1 })}>
      <Text style={{ color: muted ? colors.textSecondary : colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, strong, disabled, onPress }: { label: string; strong?: boolean; disabled?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ height: 34, paddingHorizontal: 16, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: strong ? colors.text : "transparent", borderWidth: strong ? 0 : 1, borderColor: colors.border, opacity: disabled ? 0.4 : pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
    >
      <Text style={{ color: strong ? colors.background : colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 13.5 }}>{label}</Text>
    </Pressable>
  );
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
