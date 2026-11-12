import { useAuth } from "@clerk/expo";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { runRequest } from "../../src/chat/background-chat";
import { createApiClient } from "../../src/data/api";
import { haptic } from "../../src/haptics";
import { deviceTimezone, isEnded, routinesKey, scheduleText, TEMPLATES, untilText, useRoutines, WEEKDAYS, type RoutineRun, type RoutineSpec } from "../../src/routines/model";
import { useTheme } from "../../src/theme/provider";

const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold" };
const REPEAT: { label: string; value: RoutineSpec["frequency"] }[] = [
  { label: "Once", value: "once" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
];

/** A run's state in plain words, and whether it needs attention. */
const RUN_STATUS: Record<string, string> = { done: "Done", failed: "Failed", running: "Running", queued: "Starting", waiting: "Needs you", needs_input: "Needs you", cancelled: "Stopped" };

const blank = (): RoutineSpec => ({ title: "", prompt: "", frequency: "daily", timezone: deviceTimezone(), time: "08:00", weekday: 1, onceAt: new Date(Date.now() + 3_600_000).toISOString() });

/** "HH:MM" as a Date on a UTC clock, so the picker shows that exact time whatever the device zone. */
const timeAsDate = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h ?? 8, m ?? 0));
};
const dateAsTime = (date: Date) => `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;

/**
 * One routine in a native sheet: create it (from scratch or a template), or open an existing one to
 * see when it runs next, run it now, pause it, edit it, look at past runs, or delete it.
 */
export default function RoutineSheet() {
  const { id, template } = useLocalSearchParams<{ id?: string; template?: string }>();
  const { getToken, userId } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const client = useQueryClient();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const routines = useRoutines();
  const routine = id ? routines.data?.find((r) => r.id === id) : undefined;
  const ended = routine ? isEnded(routine) : false;

  const initial = useMemo<RoutineSpec>(() => {
    if (routine) return routine.spec;
    const preset = TEMPLATES.find((t) => t.key === template);
    return preset ? { ...blank(), ...preset.spec } : blank();
    // The form starts from what the routine was when the sheet opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routine?.id, template]);
  const [spec, setSpec] = useState<RoutineSpec>(initial);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runKey = useRef<string | null>(null);
  const runs = useQuery({
    queryKey: ["routine-runs", userId, id],
    enabled: !!routine,
    queryFn: async () => (await runRequest<{ runs: RoutineRun[] }>(getToken, `schedules/${id}/runs`)).runs,
  });

  const change = <K extends keyof RoutineSpec>(key: K, value: RoutineSpec[K]) => setSpec((previous) => ({ ...previous, [key]: value }));
  const dirty = JSON.stringify(spec) !== JSON.stringify(initial);
  const valid = spec.title.trim().length > 0 && spec.prompt.trim().length > 0 && (spec.frequency !== "weekly" || !!spec.weekday) && (spec.frequency !== "once" || !!spec.onceAt);
  const canSave = valid && !saving && !ended && (!routine || dirty);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/tasks"));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const clean = { ...spec, title: spec.title.trim(), prompt: spec.prompt.trim() };
    try {
      if (routine) {
        const response = await api.v1.schedules[":id"].$patch({ param: { id: routine.id }, json: { spec: clean, version: routine.version } });
        if (!response.ok) throw new Error("Someone changed this routine meanwhile. Close and open it again.");
      } else {
        // Made here by the user, so it starts straight away: save it, then turn it on.
        const { routine: draft } = await runRequest<{ routine: { id: string; version: number } }>(getToken, "schedules/draft", clean);
        await runRequest(getToken, `schedules/${draft.id}/control`, { action: "confirm", version: draft.version });
      }
      haptic.success();
      await client.invalidateQueries({ queryKey: routinesKey(userId) });
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t save. Your changes are still here.");
    } finally {
      setSaving(false);
    }
  };

  const act = async (action: "confirm" | "pause" | "resume" | "run" | "cancel") => {
    if (!routine) return;
    setActing(action);
    setError(null);
    try {
      if (action === "run") {
        runKey.current ??= randomUUID();
        const { run } = await runRequest<{ run: { id: string } }>(getToken, `schedules/${routine.id}/run`, { requestKey: runKey.current });
        runKey.current = null;
        haptic.success();
        router.replace({ pathname: "/(app)/feed", params: { runId: run.id } });
        return;
      }
      await runRequest(getToken, `schedules/${routine.id}/control`, { action, version: routine.version });
      haptic.selection();
      await client.invalidateQueries({ queryKey: routinesKey(userId) });
      if (action === "cancel") close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t update this routine.");
    } finally {
      setActing(null);
    }
  };

  const remove = () =>
    Alert.alert("Delete this routine?", "It won’t run again. Past results stay in your chat.", [
      { text: "Keep it", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void act("cancel") },
    ]);

  if (id && !routine)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        {routines.isLoading ? <ActivityIndicator /> : <Text style={{ color: colors.textSecondary, fontFamily: font.regular }}>This routine isn’t here anymore.</Text>}
      </View>
    );

  const next = routine?.status === "active" ? untilText(routine.nextRunAt) : null;
  const statusLine = !routine
    ? null
    : routine.status === "draft"
      ? "Drafted for you · turn it on to start"
      : routine.status === "paused"
        ? "Paused"
        : ended
          ? routine.status === "finished"
            ? "Finished"
            : "Deleted"
          : `On · next run ${next ?? "soon"}`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <HeaderButton label="Cancel" onPress={close} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, textAlign: "center", color: colors.text, fontFamily: font.semibold, fontSize: 17 }}>
          {routine ? (ended ? "Routine" : "Edit routine") : "New routine"}
        </Text>
        {ended ? <View style={{ width: 64 }} /> : <HeaderButton label={routine ? "Save" : "Create"} strong disabled={!canSave} busy={saving} onPress={() => void save()} />}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 32, gap: 26 }}
      >
        {routine && (
          <View style={{ gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.textMuted, fontFamily: font.medium, fontSize: 13 }}>{statusLine}</Text>
              <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 15 }}>{scheduleText(routine.spec)}</Text>
            </View>
            {!ended && (
              <View style={{ flexDirection: "row", gap: 10 }}>
                {routine.status === "draft" ? (
                  <Action label="Turn on" primary busy={acting === "confirm"} onPress={() => void act("confirm")} />
                ) : (
                  <>
                    <Action label="Run now" primary busy={acting === "run"} onPress={() => void act("run")} />
                    <Action label={routine.status === "paused" ? "Resume" : "Pause"} busy={acting === "pause" || acting === "resume"} onPress={() => void act(routine.status === "paused" ? "resume" : "pause")} />
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {error && (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>
            {error}
          </Text>
        )}

        <Section title="What to do">
          <Field>
            <TextInput
              value={spec.title}
              onChangeText={(value) => change("title", value)}
              editable={!ended}
              placeholder="Name, e.g. Morning briefing"
              placeholderTextColor={colors.textMuted}
              maxLength={120}
              returnKeyType="next"
              accessibilityLabel="Routine name"
              style={{ color: colors.text, fontFamily: font.semibold, fontSize: 16, paddingVertical: 2 }}
            />
          </Field>
          <Field>
            <TextInput
              value={spec.prompt}
              onChangeText={(value) => change("prompt", value)}
              editable={!ended}
              multiline
              placeholder="What should your mate do each time?"
              placeholderTextColor={colors.textMuted}
              maxLength={4000}
              accessibilityLabel="What your mate should do"
              style={{ color: colors.text, fontFamily: font.regular, fontSize: 16, lineHeight: 22, minHeight: 88, textAlignVertical: "top", paddingVertical: 2 }}
            />
          </Field>
        </Section>

        <Section title="When" caption={`Times are in ${spec.timezone.replace(/_/g, " ")}.`}>
          <Field>
            <SegmentedControl
              values={REPEAT.map((r) => r.label)}
              selectedIndex={REPEAT.findIndex((r) => r.value === spec.frequency)}
              enabled={!ended}
              appearance={isDark ? "dark" : "light"}
              onValueChange={(label) => {
                haptic.selection();
                change("frequency", REPEAT.find((r) => r.label === label)!.value);
              }}
            />
          </Field>

          {spec.frequency === "weekly" && (
            <Field>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                {WEEKDAYS.map((day, i) => {
                  const selected = spec.weekday === i + 1;
                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="radio"
                      accessibilityLabel={day}
                      accessibilityState={{ selected, disabled: ended }}
                      disabled={ended}
                      onPress={() => {
                        haptic.selection();
                        change("weekday", i + 1);
                      }}
                      style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: selected ? colors.primary : colors.surfaceElevated }}
                    >
                      <Text style={{ color: selected ? colors.primaryForeground : colors.text, fontFamily: font.semibold, fontSize: 14 }}>{day.slice(0, 2)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
          )}

          {spec.frequency === "once" ? (
            <Field label="Date and time">
              <View style={{ flexDirection: "row", gap: 8 }}>
                <DateTimePicker
                  mode="date"
                  display={Platform.OS === "ios" ? "compact" : "default"}
                  value={new Date(spec.onceAt!)}
                  minimumDate={new Date()}
                  timeZoneName={spec.timezone}
                  themeVariant={isDark ? "dark" : "light"}
                  disabled={ended}
                  onValueChange={(_, date) => change("onceAt", date.toISOString())}
                />
                <DateTimePicker
                  mode="time"
                  display={Platform.OS === "ios" ? "compact" : "default"}
                  value={new Date(spec.onceAt!)}
                  timeZoneName={spec.timezone}
                  themeVariant={isDark ? "dark" : "light"}
                  disabled={ended}
                  onValueChange={(_, date) => change("onceAt", date.toISOString())}
                />
              </View>
            </Field>
          ) : (
            <Field label="Time">
              <DateTimePicker
                mode="time"
                display={Platform.OS === "ios" ? "compact" : "default"}
                value={timeAsDate(spec.time)}
                timeZoneName="UTC"
                themeVariant={isDark ? "dark" : "light"}
                disabled={ended}
                onValueChange={(_, date) => change("time", dateAsTime(date))}
              />
            </Field>
          )}
        </Section>

        {routine && (
          <Section title="Past runs">
            {runs.isLoading ? (
              <Field>
                <ActivityIndicator />
              </Field>
            ) : runs.data?.length ? (
              runs.data.slice(0, 8).map((run) => (
                <Pressable
                  key={run.id}
                  accessibilityRole="button"
                  onPress={() => router.replace({ pathname: "/(app)/feed", params: { runId: run.id } })}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: pressed ? colors.surfaceElevated : "transparent" })}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: run.status === "failed" ? colors.error : run.status === "done" ? colors.text : colors.textMuted }} />
                  <Text style={{ flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 15 }}>
                    {new Date(run.scheduledFor).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontFamily: font.medium, fontSize: 13 }}>{RUN_STATUS[run.status] ?? run.status.replace(/_/g, " ")}</Text>
                </Pressable>
              ))
            ) : (
              <Field>
                <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15 }}>It hasn’t run yet.</Text>
              </Field>
            )}
          </Section>
        )}

        {routine && !ended && (
          <Pressable accessibilityRole="button" onPress={remove} style={({ pressed }) => ({ alignSelf: "center", paddingVertical: 10, paddingHorizontal: 16, opacity: pressed ? 0.5 : 1 })}>
            <Text style={{ color: colors.error, fontFamily: font.semibold, fontSize: 15 }}>Delete routine</Text>
          </Pressable>
        )}

        {!routine && <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 13, lineHeight: 18 }}>Results land in your chat. Anything that sends, buys or changes something outside Mates still asks for your OK.</Text>}
      </ScrollView>
    </View>
  );
}

/** A titled group of fields on one surface, separated by hairlines. */
function Section({ title, caption, children }: { title: string; caption?: string; children: ReactNode }) {
  const { colors } = useTheme();
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.textSecondary, fontFamily: font.semibold, fontSize: 13, letterSpacing: 0.2, paddingHorizontal: 4 }}>{title}</Text>
      <View style={{ borderRadius: 18, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.surface }}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: colors.border }} />}
            {row}
          </View>
        ))}
      </View>
      {caption && <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 13, paddingHorizontal: 4 }}>{caption}</Text>}
    </View>
  );
}

function Field({ label, children }: { label?: string; children: ReactNode }) {
  const { colors } = useTheme();
  if (!label) return <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>{children}</View>;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 52 }}>
      <Text style={{ color: colors.text, fontFamily: font.regular, fontSize: 16 }}>{label}</Text>
      {children}
    </View>
  );
}

function HeaderButton({ label, strong, disabled, busy, onPress }: { label: string; strong?: boolean; disabled?: boolean; busy?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled || busy} hitSlop={10} onPress={onPress} style={({ pressed }) => ({ width: 64, alignItems: strong ? "flex-end" : "flex-start", opacity: pressed ? 0.5 : 1 })}>
      {busy ? <ActivityIndicator /> : <Text style={{ color: disabled ? colors.textMuted : colors.text, fontFamily: strong ? font.semibold : font.regular, fontSize: 17 }}>{label}</Text>}
    </Pressable>
  );
}

function Action({ label, primary, busy, onPress }: { label: string; primary?: boolean; busy?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const foreground = primary ? colors.primaryForeground : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: primary ? colors.primary : colors.surface, opacity: pressed ? 0.8 : 1 })}
    >
      {busy ? <ActivityIndicator color={foreground} /> : <Text style={{ color: foreground, fontFamily: font.semibold, fontSize: 15 }}>{label}</Text>}
    </Pressable>
  );
}
