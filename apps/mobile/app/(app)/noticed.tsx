import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { ChatIcon } from "../../src/chat/chat-icon";
import { haptic } from "../../src/haptics";
import { evidenceText, useHabitActions, useHabits, type Habit } from "../../src/habits/use-habits";
import { usePullToRefresh } from "../../src/hooks/use-pull-to-refresh";
import { useTheme } from "../../src/theme/provider";

const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold" };

const STATUS: Record<Habit["status"], string> = { candidate: "Noticed", confirmed: "Confirmed", paused: "Paused", dismissed: "Removed" };

/**
 * "What I've noticed": the habits mates picked up from how you use them, why they think so, and
 * the switches. Every habit can be confirmed, moved, paused or removed; nothing is done without
 * a tap or your approval rules.
 */
export default function NoticedScreen() {
  const { colors } = useTheme();
  const query = useHabits();
  const actions = useHabitActions();
  const pull = usePullToRefresh(() => query.refetch());
  const [error, setError] = useState<string | null>(null);
  const [retiming, setRetiming] = useState<{ habit: Habit; at: Date } | null>(null);
  const data = query.data;
  const settings = data?.settings;
  const learning = !!settings?.memoryEnabled && !!settings.habitLearning;

  const run = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn’t work. Try again.");
      haptic.error();
    }
  };
  const setSetting = (values: Parameters<typeof actions.settings>[0]) => {
    haptic.selection();
    void run(() => actions.settings(values));
  };
  const turnOffLearning = () =>
    Alert.alert("Stop learning your habits?", "Your mates will forget what they’ve noticed and stop suggesting things.", [
      { text: "Cancel", style: "cancel" },
      { text: "Turn off", style: "destructive", onPress: () => setSetting({ habitLearning: false }) },
    ]);
  const clear = () =>
    Alert.alert("Clear everything?", "Every habit, topic and the activity they were learned from is deleted now. Learning carries on from here unless you turn it off.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear everything", style: "destructive", onPress: () => void run(actions.clear) },
    ]);

  const options = (habit: Habit) => {
    haptic.light();
    const choices: { label: string; destructive?: boolean; onPress: () => void }[] = [];
    if (habit.status === "candidate") choices.push({ label: "That’s right", onPress: () => void run(() => actions.change(habit, "confirm")) });
    if (habit.trigger.type === "time" && !habit.automatic) {
      const trigger = habit.trigger;
      choices.push({ label: "Change time", onPress: () => setRetiming({ habit, at: new Date(2000, 0, 1, trigger.hour, trigger.minute) }) });
    }
    if (habit.status === "paused") choices.push({ label: "Resume suggestions", onPress: () => void run(() => actions.change(habit, "resume")) });
    else if (!habit.automatic) choices.push({ label: "Pause suggestions", onPress: () => void run(() => actions.change(habit, "pause")) });
    if (habit.mate) {
      const chatId = habit.mate.chatId;
      choices.push({ label: `Open ${habit.mate.name}’s chat`, onPress: () => router.push({ pathname: "/(app)", params: { notificationChatId: chatId } }) });
    }
    choices.push({ label: "Remove", destructive: true, onPress: () => void run(() => actions.remove(habit.id)) });
    if (Platform.OS === "ios") {
      const labels = [...choices.map((c) => c.label), "Cancel"];
      ActionSheetIOS.showActionSheetWithOptions(
        { title: habit.title, options: labels, destructiveButtonIndex: choices.findIndex((c) => c.destructive), cancelButtonIndex: labels.length - 1 },
        (i) => choices[i]?.onPress(),
      );
    } else Alert.alert(habit.title, habit.description, [...choices.map((c) => ({ text: c.label, style: c.destructive ? ("destructive" as const) : ("default" as const), onPress: c.onPress })), { text: "Cancel", style: "cancel" }]);
  };

  const habits = data?.habits ?? [];
  const groups: { title: string; items: Habit[] }[] = [
    { title: "Done for you", items: habits.filter((h) => h.automatic) },
    { title: "Habits", items: habits.filter((h) => !h.automatic && h.trigger.type === "time") },
    { title: "After meetings and events", items: habits.filter((h) => !h.automatic && h.trigger.type === "after_event") },
  ].filter((g) => g.items.length);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 56, gap: 28 }}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22 }}>
        Your mates notice what you do regularly and offer to handle it, at most twice a day and never in your quiet hours. They only act when you say so.
      </Text>

      {data && !data.available && (
        <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>This is still being switched on for your account. Your settings are saved.</Text>
      )}

      {settings && (
        <Group>
          <ToggleRow
            title="Learn my habits"
            detail={settings.memoryEnabled ? "From what you ask your mates, what they do for you and what you open." : "Turn on Memory to use this."}
            value={learning}
            disabled={!settings.memoryEnabled}
            onChange={(on) => (on ? setSetting({ habitLearning: true }) : turnOffLearning())}
          />
          <ToggleRow
            title="Learn from my apps"
            detail={settings.plusFeatures ? "Who you email and your calendar, never what the emails say." : "Comes with Plus."}
            value={settings.learnFromApps}
            disabled={!learning || !settings.plusFeatures}
            onChange={(learnFromApps) => setSetting({ learnFromApps })}
          />
          <ToggleRow
            title="Meeting prep"
            detail={settings.plusFeatures ? "A short brief 20 minutes before meetings with other people." : "Comes with Plus."}
            value={settings.meetingPrep && settings.plusFeatures}
            disabled={!settings.plusFeatures}
            onChange={(meetingPrep) => setSetting({ meetingPrep })}
          />
        </Group>
      )}

      {(error || query.isError) && (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>
          {error ?? "Couldn’t load this. Pull down to try again."}
        </Text>
      )}

      {query.isSuccess && habits.length === 0 && (
        <View style={{ alignItems: "center", gap: 10, paddingVertical: 28, opacity: learning ? 1 : 0.55 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
            <ChatIcon name="ideas" color={colors.text} size={24} />
          </View>
          <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 16 }}>Nothing noticed yet</Text>
          <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 300 }}>
            After a couple of weeks of using your mates, the things you do regularly show up here.
          </Text>
        </View>
      )}

      {groups.map((group) => (
        <View key={group.title} style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 17, paddingHorizontal: 4 }}>{group.title}</Text>
          <Group>
            {group.items.map((habit) => (
              <View key={habit.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Shows options"
                  onPress={() => options(habit)}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingLeft: 16, paddingRight: 8, paddingVertical: 13, opacity: pressed ? 0.6 : habit.status === "paused" ? 0.6 : 1 })}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 16, lineHeight: 22 }}>{habit.title}</Text>
                    <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13, lineHeight: 18 }}>
                      {habit.when} · {evidenceText(habit)}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 12 }}>
                      {habit.automatic ? "Done automatically" : STATUS[habit.status]}
                      {habit.mate ? ` · ${habit.mate.name}` : ""}
                      {!habit.automatic && habit.status !== "paused" ? ` · ${Math.round(habit.confidence * 100)}% sure` : ""}
                    </Text>
                  </View>
                  <View style={{ padding: 6 }}>
                    <ChatIcon name="more" color={colors.textMuted} size={18} />
                  </View>
                </Pressable>
                {retiming?.habit.id === habit.id && (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
                    <TimePicker value={retiming.at} onChange={(at) => setRetiming({ habit, at })} onDone={() => undefined} />
                    <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                      <SmallButton label="Cancel" onPress={() => setRetiming(null)} />
                      <SmallButton
                        label="Save"
                        strong
                        onPress={() => {
                          const at = retiming.at;
                          setRetiming(null);
                          void run(() => actions.change(habit, "retime", { hour: at.getHours(), minute: at.getMinutes() }));
                        }}
                      />
                    </View>
                  </View>
                )}
              </View>
            ))}
          </Group>
        </View>
      ))}

      {(data?.topics.length ?? 0) > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 17, paddingHorizontal: 4 }}>Topics you follow</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {data!.topics.map((t) => (
              <Pressable
                key={t.topic}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${t.topic}`}
                onPress={() => {
                  haptic.light();
                  void run(() => actions.removeTopic(t.topic));
                }}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 14, paddingRight: 10, height: 36, borderRadius: 18, backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ color: colors.text, fontFamily: font.regular, fontSize: 14 }}>{t.topic}</Text>
                <ChatIcon name="close" color={colors.textMuted} size={13} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {(habits.length > 0 || (data?.topics.length ?? 0) > 0) && (
        <Pressable accessibilityRole="button" onPress={clear} style={({ pressed }) => ({ alignSelf: "center", padding: 8, opacity: pressed ? 0.5 : 1 })}>
          <Text style={{ color: colors.error, fontFamily: font.medium, fontSize: 15 }}>Clear everything</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

/** Rows on one rounded surface, separated by hairlines, as on the Memory screen. */
function Group({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={{ borderRadius: 18, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.surface }}>
      {rows.map((row, i) => (
        <View key={i}>
          {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: colors.border }} />}
          {row}
        </View>
      ))}
    </View>
  );
}

function ToggleRow({ title, detail, value, disabled, onChange }: { title: string; detail: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 16, paddingVertical: 13, opacity: disabled ? 0.45 : 1 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 16 }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13, lineHeight: 18 }}>{detail}</Text>
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onChange} accessibilityLabel={title} />
    </View>
  );
}

function SmallButton({ label, strong, onPress }: { label: string; strong?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: strong ? colors.text : colors.surfaceElevated, opacity: pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: strong ? colors.background : colors.text, fontFamily: font.semibold, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** The native time wheel on iOS; the system dialog on Android. */
function TimePicker({ value, onChange, onDone }: { value: Date; onChange: (date: Date) => void; onDone: () => void }) {
  const { isDark } = useTheme();
  if (Platform.OS === "android")
    return (
      <DateTimePicker
        mode="time"
        presentation="dialog"
        value={value}
        onValueChange={(_, date) => {
          onChange(date);
          onDone();
        }}
        onDismiss={onDone}
      />
    );
  return (
    <View style={{ alignItems: "center" }}>
      <DateTimePicker mode="time" display="spinner" value={value} themeVariant={isDark ? "dark" : "light"} style={{ width: "100%", height: 190 }} onValueChange={(_, date) => onChange(date)} />
    </View>
  );
}
