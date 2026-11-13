import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { runRequest } from "../../src/chat/background-chat";
import { ChatIcon } from "../../src/chat/chat-icon";
import { haptic } from "../../src/haptics";
import { useLeaderName } from "../../src/mates/data";
import { isEnded, remindersKey, routinesKey, scheduleText, TEMPLATES, untilText, useReminders, useRoutines, type Reminder, type Routine } from "../../src/routines/model";
import { useTheme } from "../../src/theme/provider";

const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold", bold: "DMSans_700Bold" };

/** Routines: work the mates do on a schedule, grouped by what needs you, what runs, and what's paused. */
export default function RoutinesScreen() {
  const { getToken, userId } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const leaderName = useLeaderName();
  const routines = useRoutines();
  const reminders = useReminders();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [showEnded, setShowEnded] = useState(false);
  useFocusEffect(useCallback(() => void Promise.all([routines.refetch(), reminders.refetch()]), [routines.refetch, reminders.refetch]));

  const open = (params: { id?: string; template?: string } = {}) => {
    haptic.light();
    router.push({ pathname: "/routine", params });
  };

  /** Turn a routine on or off (or confirm a draft); the switch moves at once and settles on the reply. */
  const control = async (routine: Routine, action: "confirm" | "pause" | "resume") => {
    setError(null);
    setPending((p) => ({ ...p, [routine.id]: action !== "pause" }));
    haptic.selection();
    try {
      await runRequest(getToken, `schedules/${routine.id}/control`, { action, version: routine.version });
      await client.invalidateQueries({ queryKey: routinesKey(userId) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t update that routine.");
    } finally {
      setPending((p) => {
        const { [routine.id]: _, ...rest } = p;
        return rest;
      });
    }
  };

  const cancelReminder = (reminder: Reminder) =>
    Alert.alert("Cancel this reminder?", reminder.title, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel reminder",
        style: "destructive",
        onPress: async () => {
          try {
            await runRequest(getToken, `reminders/${reminder.id}/cancel`, {});
            await client.invalidateQueries({ queryKey: remindersKey(userId) });
          } catch {
            setError("Couldn’t cancel the reminder.");
          }
        },
      },
    ]);

  const all = routines.data ?? [];
  const drafts = all.filter((r) => r.status === "draft");
  const active = all.filter((r) => r.status === "active").sort((a, b) => (a.nextRunAt ?? "").localeCompare(b.nextRunAt ?? ""));
  const paused = all.filter((r) => r.status === "paused");
  const ended = all.filter(isEnded);
  const upcoming = reminders.data ?? [];
  const empty = routines.isSuccess && all.length === 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Routines",
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="New routine" hitSlop={10} onPress={() => open()} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
              <ChatIcon name="add" color={colors.text} size={24} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 56, gap: 28 }}
        refreshControl={<RefreshControl refreshing={routines.isRefetching} onRefresh={() => void Promise.all([routines.refetch(), reminders.refetch()])} />}
      >
        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22 }}>
          Work your mates do on a schedule, even while you’re away. Results land in your chat.
        </Text>

        {(error || routines.isError) && (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>
            {error ?? "Couldn’t refresh your routines. Pull down to try again."}
          </Text>
        )}

        {routines.isLoading && <Skeleton />}

        {drafts.length > 0 && (
          <Group title="Needs your OK" caption={`Drafted for you. Turn ${drafts.length === 1 ? "it" : "them"} on to start.`}>
            {drafts.map((routine) => (
              <RoutineRow key={routine.id} routine={routine} onPress={() => open({ id: routine.id })} trailing={<Pill label="Turn on" busy={routine.id in pending} onPress={() => void control(routine, "confirm")} />} />
            ))}
          </Group>
        )}

        {active.length > 0 && (
          <Group title="Active">
            {active.map((routine) => (
              <RoutineRow
                key={routine.id}
                routine={routine}
                onPress={() => open({ id: routine.id })}
                trailing={<Switch value={pending[routine.id] ?? true} disabled={routine.id in pending} onValueChange={() => void control(routine, "pause")} accessibilityLabel={`${routine.title}, on`} />}
              />
            ))}
          </Group>
        )}

        {paused.length > 0 && (
          <Group title="Paused">
            {paused.map((routine) => (
              <RoutineRow
                key={routine.id}
                routine={routine}
                onPress={() => open({ id: routine.id })}
                trailing={<Switch value={pending[routine.id] ?? false} disabled={routine.id in pending} onValueChange={() => void control(routine, "resume")} accessibilityLabel={`${routine.title}, paused`} />}
              />
            ))}
          </Group>
        )}

        {upcoming.length > 0 && (
          <Group title="Reminders">
            {upcoming.map((reminder) => (
              <Row
                key={reminder.id}
                icon="clock"
                title={reminder.title}
                subtitle={`${new Date(reminder.remindAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}${reminder.body ? ` · ${reminder.body}` : ""}`}
                trailing={
                  <Pressable accessibilityRole="button" accessibilityLabel={`Cancel reminder: ${reminder.title}`} hitSlop={10} onPress={() => cancelReminder(reminder)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                    <ChatIcon name="close" color={colors.textMuted} size={18} />
                  </Pressable>
                }
              />
            ))}
          </Group>
        )}

        {empty && (
          <View style={{ gap: 28 }}>
            <View style={{ alignItems: "center", gap: 10, paddingTop: 24 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
                <ChatIcon name="clock" color={colors.text} size={26} />
              </View>
              <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 18 }}>No routines yet</Text>
              <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 300 }}>
                Start from one of these, tap + to write your own, or ask {leaderName} in chat to set one up.
              </Text>
            </View>
            <Group title="Start from">
              {TEMPLATES.map((template) => (
                <Row key={template.key} icon="add" title={template.title} subtitle={template.caption} onPress={() => open({ template: template.key })} chevron />
              ))}
            </Group>
          </View>
        )}

        {ended.length > 0 && (
          <View style={{ gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showEnded }}
              onPress={() => setShowEnded((s) => !s)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.5 : 1, alignSelf: "flex-start" })}
            >
              <Text style={{ color: colors.textMuted, fontFamily: font.medium, fontSize: 14 }}>{showEnded ? "Hide" : "Show"} ended ({ended.length})</Text>
              <View style={{ transform: [{ rotate: showEnded ? "180deg" : "0deg" }] }}>
                <ChatIcon name="chevronDown" color={colors.textMuted} size={16} />
              </View>
            </Pressable>
            {showEnded && (
              <Group>
                {ended.map((routine) => (
                  <RoutineRow key={routine.id} routine={routine} onPress={() => open({ id: routine.id })} />
                ))}
              </Group>
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

/** A titled group of rows on one surface, separated by hairlines: no boxes around each row. */
function Group({ title, caption, children }: { title?: string; caption?: string; children: ReactNode }) {
  const { colors } = useTheme();
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={{ gap: 8 }}>
      {title && <Text style={{ color: colors.textSecondary, fontFamily: font.semibold, fontSize: 13, letterSpacing: 0.2, paddingHorizontal: 4 }}>{title}</Text>}
      <View style={{ borderRadius: 18, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.surface }}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 64, backgroundColor: colors.border }} />}
            {row}
          </View>
        ))}
      </View>
      {caption && <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 }}>{caption}</Text>}
    </View>
  );
}

function Row({ icon, title, subtitle, trailing, onPress, chevron, muted }: { icon: "clock" | "add" | "check"; title: string; subtitle?: string; trailing?: ReactNode; onPress?: () => void; chevron?: boolean; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: pressed ? colors.surfaceElevated : "transparent" })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 11, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceElevated }}>
        <ChatIcon name={icon} color={muted ? colors.textMuted : colors.text} size={18} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: muted ? colors.textSecondary : colors.text, fontFamily: font.semibold, fontSize: 16 }}>{title}</Text>
        {subtitle ? <Text numberOfLines={2} style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13, lineHeight: 18 }}>{subtitle}</Text> : null}
      </View>
      {trailing}
      {chevron && <ChatIcon name="next" color={colors.textMuted} size={16} />}
    </Pressable>
  );
}

function RoutineRow({ routine, trailing, onPress }: { routine: Routine; trailing?: ReactNode; onPress: () => void }) {
  const ended = isEnded(routine);
  const next = routine.status === "active" ? untilText(routine.nextRunAt) : null;
  const subtitle = ended ? `${routine.status === "finished" ? "Finished" : "Deleted"} · ${scheduleText(routine.spec)}` : `${scheduleText(routine.spec)}${next ? ` · next ${next}` : ""}`;
  return <Row icon={routine.status === "draft" ? "check" : "clock"} title={routine.title} subtitle={subtitle} trailing={trailing} onPress={onPress} muted={ended || routine.status === "paused"} chevron={!trailing} />;
}

function Pill({ label, busy, onPress }: { label: string; busy?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.primary, opacity: busy ? 0.5 : pressed ? 0.8 : 1 })}
    >
      <Text style={{ color: colors.primaryForeground, fontFamily: font.semibold, fontSize: 14 }}>{busy ? "Turning on…" : label}</Text>
    </Pressable>
  );
}

/** Placeholder rows in the shape of the list while the first load runs. */
function Skeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14 }}>
          <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: colors.surfaceElevated }} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ width: "55%", height: 12, borderRadius: 6, backgroundColor: colors.surfaceElevated }} />
            <View style={{ width: "80%", height: 10, borderRadius: 5, backgroundColor: colors.surfaceElevated }} />
          </View>
        </View>
      ))}
    </View>
  );
}
