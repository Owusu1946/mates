import { Button, Host, Picker, TextInput, useNativeState } from "@expo/ui";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme/provider";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";

export type RoutineSpec = { title: string; prompt: string; frequency: "once" | "daily" | "weekly"; timezone: string; time: string; weekday: number | null; onceAt: string | null };
function NativeField({ label, value, onChange, multiline }: { label: string; value: string; onChange(value: string): void; multiline?: boolean }) {
  const native = useNativeState(value);
  const { colors, isDark } = useTheme();
  useEffect(() => { native.set(value); }, [value]);
  return <View style={{ gap: 6 }}><Text style={{ fontSize: 13, color: colors.textSecondary }}>{label}</Text><Host matchContents colorScheme={isDark ? "dark" : "light"}><TextInput value={native} onChangeText={onChange} multiline={multiline} placeholder={label} style={{ padding: 12, borderRadius: 12, backgroundColor: colors.surfaceElevated }} /></Host></View>;
}

export function RoutineForm({ initial, onSave, onCancel }: { initial?: RoutineSpec; onSave(spec: RoutineSpec): Promise<void>; onCancel(): void }) {
  const { colors, isDark } = useTheme();
  const [spec, setSpec] = useState<RoutineSpec>(initial ?? { title: "", prompt: "", frequency: "daily", timezone: "Africa/Accra", time: "08:00", weekday: 1, onceAt: new Date(Date.now() + 3600_000).toISOString() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = <K extends keyof RoutineSpec>(key: K, value: RoutineSpec[K]) => setSpec(previous => ({ ...previous, [key]: value }));
  return <View style={{ gap: 14, padding: 18, borderRadius: 20, backgroundColor: colors.surface }}>
    <NativeField label="Routine name" value={spec.title} onChange={value => change("title", value)} />
    <NativeField label="What should your mate do?" value={spec.prompt} multiline onChange={value => change("prompt", value)} />
    <Host matchContents colorScheme={isDark ? "dark" : "light"}><Picker selectedValue={spec.frequency} onValueChange={value => change("frequency", value as RoutineSpec["frequency"])}><Picker.Item label="One time" value="once" /><Picker.Item label="Daily" value="daily" /><Picker.Item label="Weekly" value="weekly" /></Picker></Host>
    <NativeField label="Timezone" value={spec.timezone} onChange={value => change("timezone", value)} />
    {spec.frequency === "once" ? <View style={{ gap: 8 }}><Text style={{ color: colors.textSecondary }}>Run at</Text><DateTimePicker mode="date" value={new Date(spec.onceAt!)} timeZoneName={spec.timezone} onValueChange={(_, date) => change("onceAt", date.toISOString())} /><DateTimePicker mode="time" value={new Date(spec.onceAt!)} timeZoneName={spec.timezone} onValueChange={(_, date) => change("onceAt", date.toISOString())} /></View> : <NativeField label="Local time (HH:MM)" value={spec.time} onChange={value => change("time", value)} />}
    {spec.frequency === "weekly" && <Host matchContents colorScheme={isDark ? "dark" : "light"}><Picker selectedValue={spec.weekday ?? 1} onValueChange={value => change("weekday", Number(value))}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, i) => <Picker.Item key={day} label={day} value={i + 1} />)}</Picker></Host>}
    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Save a draft, check its next run, then confirm. Results appear in this chat. External actions require approval.</Text>
    {error && <Text style={{ color: colors.error }}>{error}</Text>}
    <Host matchContents colorScheme={isDark ? "dark" : "light"}><Button label={busy ? "Saving…" : "Save draft"} disabled={busy} onPress={async () => {
      setBusy(true); setError(null);
      try { await onSave(spec); } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t save. Your draft is kept here."); } finally { setBusy(false); }
    }} /></Host>
    <Host matchContents colorScheme={isDark ? "dark" : "light"}><Button label="Cancel" variant="text" disabled={busy} onPress={onCancel} /></Host>
  </View>;
}
