import { useAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { createApiClient } from "../../src/data/api";
import { font, Group } from "../../src/memory/memory-ui";
import { useTheme } from "../../src/theme/provider";

type Section = "calendar" | "email" | "weather" | "power" | "rides" | "bills" | "tasks" | "deferred";
type Settings = { enabled: boolean; time: string; timezone: string; weekends: "full" | "light" | "off"; sections: Section[]; mutedSections: Section[]; commuteOrigin: string; nextRunAt: string | null };
const AVAILABLE: { id: Section; label: string; detail: string }[] = [
  { id: "calendar", label: "Calendar", detail: "Meetings and conflicts" },
  { id: "email", label: "Email", detail: "Messages needing a decision" },
  { id: "tasks", label: "Tasks", detail: "Reminders and work waiting for you" },
  { id: "rides", label: "Commute", detail: "Ride estimate for your next meeting in Ghana" },
];
const LATER = "Weather, light-off windows, bills and deferred items are coming later.";

/** The brief is off until the person saves their choices. */
export default function MorningBriefSettings() {
  const { getToken, userId } = useAuth();
  const { colors } = useTheme();
  const client = useMemo(() => createApiClient(getToken), [getToken]);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["morning-brief-settings", userId],
    queryFn: async () => {
      const response = await client.v1["morning-brief"].settings.$get();
      if (!response.ok) throw new Error("Couldn’t load your brief settings.");
      const { settings } = await response.json();
      return settings as Settings;
    },
  });
  useFocusEffect(useCallback(() => { void query.refetch(); }, [query.refetch]));
  const current = draft ?? query.data;
  const update = (change: Partial<Settings>) => { if (current) setDraft({ ...current, ...change }); };
  const selected = current?.sections.filter((section) => AVAILABLE.some((item) => item.id === section)) ?? [];
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(current?.time ?? "");
  const save = async () => {
    if (!current || saving) return;
    if (!validTime || !selected.length) return setError("Choose a time in HH:mm format and at least one section.");
    if (selected.includes("rides") && (current.commuteOrigin ?? "").trim().length < 2) return setError("Add your starting place for commute estimates.");
    setSaving(true);
    setError(null);
    try {
      const restored = (query.data?.mutedSections ?? []).filter((section) => !current.mutedSections.includes(section));
      const response = await client.v1["morning-brief"].settings.$put({ json: {
        enabled: current.enabled, time: current.time, timezone: current.timezone, weekends: current.weekends,
        sections: current.sections,
        commuteOrigin: (current.commuteOrigin ?? "").trim(),
      } });
      if (!response.ok) throw new Error("Couldn’t save your brief settings. Try again.");
      for (const section of restored) {
        const result = await client.v1["morning-brief"].muted[":section"].$delete({ param: { section } });
        if (!result.ok) throw new Error("Settings saved, but a hidden section couldn’t be restored. Try again.");
      }
      const fresh = await client.v1["morning-brief"].settings.$get();
      if (!fresh.ok) throw new Error("Settings saved. Pull to refresh to check them.");
      const { settings } = await fresh.json();
      queryClient.setQueryData(["morning-brief-settings", userId], settings);
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t save your brief settings.");
    } finally { setSaving(false); }
  };
  const toggle = (section: Section) => {
    if (!current) return;
    const on = current.sections.includes(section) && !current.mutedSections.includes(section);
    update({
      sections: on ? current.sections.filter((item) => item !== section) : [...new Set([...current.sections, section])],
      mutedSections: on ? current.mutedSections : current.mutedSections.filter((item) => item !== section),
    });
  };

  return <>
    <Stack.Screen options={{ title: "Morning brief", headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 60, gap: 22 }}>
    <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22 }}>One short message from your lead mate each morning. You can change this any time.</Text>
    {query.isLoading && !current ? <ActivityIndicator accessibilityLabel="Loading brief settings" /> : null}
    {query.isError && !current ? <Pressable onPress={() => void query.refetch()}><Text style={{ color: colors.error }}>Couldn’t load settings. Tap to try again.</Text></Pressable> : null}
    {current && <>
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 13 }}>DELIVERY</Text>
        <Group>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 }}>
          <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 16 }}>Morning brief</Text>
          <Switch accessibilityLabel="Morning brief" value={current.enabled} onValueChange={(enabled) => update({ enabled })} />
        </View>
        <View style={{ padding: 14, gap: 5 }}>
          <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 16 }}>Time</Text>
          <TextInput accessibilityLabel="Brief time, 24 hour format" value={current.time} onChangeText={(time) => update({ time })} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="07:00" placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontFamily: font.medium, fontSize: 18, paddingVertical: 6 }} />
          <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13 }}>24-hour time · {current.timezone}</Text>
          <Pressable accessibilityRole="button" onPress={() => update({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}><Text style={{ color: colors.primary, fontFamily: font.medium, fontSize: 13 }}>Use this device’s time zone</Text></Pressable>
        </View>
        </Group>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 13 }}>WEEKENDS</Text>
        <Group>
        {(["full", "light", "off"] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: current.weekends === value }} onPress={() => update({ weekends: value })} style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 15 }}>{value === "full" ? "Same as weekdays" : value === "light" ? "Lighter brief" : "Off"}</Text>
          {current.weekends === value ? <Text style={{ color: colors.primary }}>✓</Text> : null}
        </Pressable>)}
        </Group>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 13 }}>INCLUDE</Text>
        <Group>
        {AVAILABLE.map((item) => <View key={item.id} style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12 }}>
          <View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 15 }}>{item.label}</Text><Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13 }}>{current.mutedSections.includes(item.id) ? "Hidden after your feedback · turn on to restore" : item.detail}</Text></View>
          <Switch accessibilityLabel={`Include ${item.label}`} value={current.sections.includes(item.id) && !current.mutedSections.includes(item.id)} onValueChange={() => toggle(item.id)} />
        </View>)}
        {current.sections.includes("rides") ? <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 5 }}>
          <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 15 }}>Start from</Text>
          <TextInput accessibilityLabel="Commute starting place" value={current.commuteOrigin ?? ""} onChangeText={(commuteOrigin) => update({ commuteOrigin })} maxLength={120} placeholder="Place and address, e.g. Osu, Accra" placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontFamily: font.medium, fontSize: 15, paddingVertical: 6 }} />
          <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 12 }}>Mates uses this place and your calendar location to check Sail for a ride estimate.</Text>
        </View> : null}
        </Group>
      </View>
      <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13, lineHeight: 19 }}>{LATER} A 07:00 brief may post in chat before its push if your notification quiet hours run until 08:00.</Text>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.error, fontFamily: font.medium }}>{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving || !draft }} disabled={saving || !draft} onPress={() => void save()} style={{ backgroundColor: colors.primary, borderRadius: 14, padding: 14, alignItems: "center", opacity: saving || !draft ? 0.5 : 1 }}><Text style={{ color: colors.background, fontFamily: font.semibold, fontSize: 16 }}>{saving ? "Saving…" : "Save changes"}</Text></Pressable>
    </>}
  </ScrollView>
  </>;
}
