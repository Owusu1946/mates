import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { font } from "../memory/memory-ui";
import { useTheme } from "../theme/provider";
import { useMateNotificationSettings, useSaveMateNotificationSettings, type MateNotificationSettings } from "./data";

const MODES: { value: MateNotificationSettings["mode"]; title: string; detail: string }[] = [
  { value: "normal", title: "Normal", detail: "Up to one non-urgent push a day from this mate, three across all mates. Extra updates go to your morning brief." },
  { value: "urgent_only", title: "Only urgent", detail: "Only watch alerts you mark urgent are pushed. Other updates wait for your morning brief." },
  { value: "off", title: "Off", detail: "No proactive pushes from this mate. Chat replies and your reminders are unaffected." },
];

const timeAsDate = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, hour ?? 22, minute ?? 0));
};
const dateAsTime = (date: Date) => `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
const timeLabel = (time: string) => timeAsDate(time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

/** Mate-specific push policy and local quiet-hour controls. */
export function MateNotificationSettings({ mateId, mateName }: { mateId: string; mateName: string }) {
  const { colors, isDark } = useTheme();
  const query = useMateNotificationSettings(mateId);
  const saveSettings = useSaveMateNotificationSettings();
  const [draft, setDraft] = useState<MateNotificationSettings | null>(null);
  const [picker, setPicker] = useState<"quietStart" | "quietEnd" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const settings = draft ?? query.data;
  const dirty = !!settings && !!query.data && (settings.mode !== query.data.mode || settings.quietStart !== query.data.quietStart || settings.quietEnd !== query.data.quietEnd);

  const update = (change: Partial<MateNotificationSettings>) => {
    if (!settings) return;
    setDraft({ ...settings, ...change });
    setError(null);
    setSaved(false);
  };

  const save = async () => {
    if (!settings || !dirty || saveSettings.isPending) return;
    setError(null);
    setSaved(false);
    try {
      const fresh = await saveSettings.mutateAsync({
        mateId,
        settings: { mode: settings.mode, quietStart: settings.quietStart, quietEnd: settings.quietEnd },
      });
      setDraft(fresh);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t save these settings. Try again.");
    }
  };

  const selectedTime = picker ? settings?.[picker] : undefined;
  const onTimeChange = (_event: unknown, date?: Date) => {
    if (picker && date) update({ [picker]: dateAsTime(date) });
    if (Platform.OS === "android") setPicker(null);
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 18 }}>Notifications</Text>
        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>
          Choose when {mateName} can interrupt you.
        </Text>
      </View>

      {query.isLoading && !settings ? <ActivityIndicator accessibilityLabel="Loading notification settings" color={colors.primary} /> : null}
      {query.isError && !settings ? (
        <Pressable accessibilityRole="button" onPress={() => void query.refetch()} style={{ padding: 14, borderRadius: 14, borderCurve: "continuous", backgroundColor: colors.surface }}>
          <Text style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>Couldn’t load settings. Tap to try again.</Text>
        </Pressable>
      ) : null}

      {settings ? <>
        <View style={{ borderRadius: 18, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.surface }}>
          {MODES.map((mode, index) => {
            const selected = settings.mode === mode.value;
            return <View key={mode.value}>
              {index > 0 ? <View style={{ height: 1, marginLeft: 16, backgroundColor: colors.border }} /> : null}
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={mode.title}
                accessibilityState={{ selected, disabled: saveSettings.isPending }}
                disabled={saveSettings.isPending}
                onPress={() => update({ mode: mode.value })}
                style={({ pressed }) => ({ padding: 15, gap: 4, opacity: pressed || saveSettings.isPending ? 0.65 : 1 })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 16 }}>{mode.title}</Text>
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: selected ? 6 : 1.5, borderColor: selected ? colors.primary : colors.textMuted }} />
                </View>
                <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13, lineHeight: 18, paddingRight: 28 }}>{mode.detail}</Text>
              </Pressable>
            </View>;
          })}
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 13 }}>QUIET HOURS</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {(["quietStart", "quietEnd"] as const).map((field) => {
              const open = picker === field;
              return <Pressable
                key={field}
                accessibilityRole="button"
                accessibilityLabel={`${field === "quietStart" ? "Quiet hours start" : "Quiet hours end"}, ${timeLabel(settings[field])}`}
                accessibilityState={{ expanded: open, disabled: saveSettings.isPending }}
                disabled={saveSettings.isPending}
                onPress={() => setPicker(open ? null : field)}
                style={({ pressed }) => ({ flex: 1, padding: 14, gap: 5, borderRadius: 15, borderCurve: "continuous", backgroundColor: colors.surface, borderWidth: open ? 1 : 0, borderColor: colors.primary, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13 }}>{field === "quietStart" ? "Start" : "End"}</Text>
                <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 19 }}>{timeLabel(settings[field])}</Text>
              </Pressable>;
            })}
          </View>
          {picker && selectedTime ? <View style={{ alignItems: "center", padding: 8, borderRadius: 16, borderCurve: "continuous", backgroundColor: colors.surface }}>
            <DateTimePicker
              mode="time"
              value={timeAsDate(selectedTime)}
              timeZoneName="UTC"
              onValueChange={onTimeChange}
              onDismiss={() => setPicker(null)}
              {...(Platform.OS === "android"
                ? { presentation: "dialog" as const }
                : { display: "spinner" as const, themeVariant: isDark ? "dark" as const : "light" as const, style: { width: "100%", height: 190 } })}
            />
          </View> : null}
          <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13, lineHeight: 18 }}>
            {settings.mode === "off"
              ? "Proactive pushes are off. Your own reminders still fire on time."
              : settings.mode === "urgent_only"
                ? `Times follow ${settings.timezone.replace(/_/g, " ")}. Only watches you mark urgent can interrupt quiet hours. Your reminders stay on time.`
                : `Times follow ${settings.timezone.replace(/_/g, " ")}. Non-urgent pushes wait until quiet hours end, but chat still gets the message. Urgent watches can come through; reminders stay on time.`}
          </Text>
        </View>

        {query.isError ? <Pressable accessibilityRole="button" onPress={() => void query.refetch()}><Text style={{ color: colors.error, fontFamily: font.medium, fontSize: 13 }}>Couldn’t refresh settings. Tap to retry.</Text></Pressable> : null}
        {error ? <Text accessibilityRole="alert" style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>{error}</Text> : null}
        {saved ? <Text accessibilityRole="alert" style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 13 }}>Settings saved.</Text> : null}
        {dirty ? <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saveSettings.isPending }}
          disabled={saveSettings.isPending}
          onPress={() => void save()}
          style={({ pressed }) => ({ alignItems: "center", padding: 14, borderRadius: 14, borderCurve: "continuous", backgroundColor: colors.primary, opacity: pressed || saveSettings.isPending ? 0.6 : 1 })}
        >
          <Text style={{ color: colors.primaryForeground, fontFamily: font.semibold, fontSize: 16 }}>{saveSettings.isPending ? "Saving…" : "Save notification settings"}</Text>
        </Pressable> : null}
      </> : null}
    </View>
  );
}
