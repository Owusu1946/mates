import { useAuth, useUser } from "@clerk/expo";
import { Column, FieldGroup, Host as UniversalHost, Picker as UniversalPicker, Row, Spacer as UniversalSpacer, Text as UniversalText } from "@expo/ui";
import { Button, Form, HStack, Host, Image, Label, Picker, Section, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import { buttonStyle, contentShape, font, foregroundStyle, lineLimit, pickerStyle, scrollIndicators, shapes, tag } from "@expo/ui/swift-ui/modifiers";
import Constants from "expo-constants";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import { createApiClient } from "../../src/data/api";
import { haptic } from "../../src/haptics";
import { useSession } from "../../src/session/provider";
import { useTheme, type ThemeMode } from "../../src/theme/provider";
import { NEARLY_USED_PCT, useUsage, type Usage } from "../../src/usage/use-usage";

const THEMES: { label: string; value: ThemeMode }[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];
type SFSymbol = NonNullable<React.ComponentProps<typeof Label>["systemImage"]>;

/** Everything the page shows and does, shared by the iOS and Android layouts. */
function useSettings() {
  const session = useSession();
  const { getToken } = useAuth();
  const { user } = useUser();
  const theme = useTheme();
  const usage = useUsage().data;
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const response = await createApiClient(getToken).v1.account.$delete();
      if (!response.ok) throw new Error();
      haptic.success();
      // The sign-in no longer exists; clearing the local session is all that's left.
      await Promise.resolve(session.signOut()).catch(() => undefined);
      router.replace("/(public)/sign-in");
    } catch {
      setDeleting(false);
      haptic.error();
      Alert.alert("Couldn’t delete your account", "Nothing was lost. Check your connection and try again.");
    }
  };

  return {
    ...theme,
    deleting,
    name: user?.fullName || user?.firstName || "Your account",
    email: user?.primaryEmailAddress?.emailAddress ?? "",
    version: Constants.expoConfig?.version ?? "—",
    usageSummary: usageSummary(usage),
    openUsage: () => router.push("/usage"),
    setTheme: (value: ThemeMode) => {
      haptic.selection();
      theme.setMode(value);
    },
    openMemory: () => router.push("/memory"),
    openApps: () => router.push("/connections"),
    openNotifications: () => void Linking.openSettings(),
    showIntro: () => router.push({ pathname: "/(onboarding)", params: { preview: "1" } }),
    signOut: () => {
      if (deleting) return;
      Alert.alert("Sign out?", "You can sign back in at any time.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: session.signOut },
      ]);
    },
    confirmDelete: () => {
      if (deleting) return;
      Alert.alert("Delete your account?", "Your chats, mates, memories, reminders and app connections are deleted for good. This can’t be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete account", style: "destructive", onPress: () => void deleteAccount() },
      ]);
    },
  };
}

type Settings = ReturnType<typeof useSettings>;

/**
 * The row's short value, one line like Settings' own: the plan, with a percentage only once an
 * allowance is nearly used ("Starter · 85%"), or "Limit reached". The detail lives a tap away.
 */
function usageSummary(usage: Usage | undefined) {
  if (!usage) return "";
  if (usage.plan.id === "none") return "No plan";
  if (usage.enforced && usage.blocked) return "Limit reached";
  const fullest = Math.max(0, ...usage.windows.map((w) => w.usedPct));
  return fullest >= NEARLY_USED_PCT ? `${usage.plan.label} · ${fullest}%` : usage.plan.label;
}

/** A tappable row that opens something: icon, title, an optional value, and the system chevron. */
function LinkRow({ title, icon, color, value, external, onPress }: { title: string; icon: SFSymbol; color: string; value?: string; external?: boolean; onPress: () => void }) {
  return (
    <Button onPress={onPress} modifiers={[buttonStyle("plain")]}>
      <HStack modifiers={[contentShape(shapes.rectangle())]}>
        <Label title={title} systemImage={icon} color={color} />
        <Spacer />
        {value ? <Text modifiers={[lineLimit(1), foregroundStyle({ type: "hierarchical", style: "secondary" })]}>{value}</Text> : null}
        <Image systemName={external ? "arrow.up.right" : "chevron.right"} size={13} color="#C4C4C7" />
      </HStack>
    </Button>
  );
}

/** iOS: pure SwiftUI (Form, Label, Picker), so rows size themselves exactly like Settings. */
function IosSettings({ s }: { s: Settings }) {
  // UIKit's systemGroupedBackground: the header takes the form's own colour, so they read as one surface.
  const grouped = s.isDark ? "#000000" : "#F2F2F7";
  return (
    <>
    <Stack.Screen options={{ headerStyle: { backgroundColor: grouped }, headerShadowVisible: false, headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
    <Host testID="settings-screen" style={{ flex: 1, backgroundColor: grouped }} colorScheme={s.isDark ? "dark" : "light"}>
      <Form modifiers={[scrollIndicators("hidden", "vertical")]}>
        <Section>
          <HStack spacing={14}>
            <Image systemName="person.crop.circle.fill" size={44} color="#d27e41" />
            <VStack alignment="leading" spacing={2}>
              <Text modifiers={[font({ size: 20, weight: "semibold" })]}>{s.name}</Text>
              {s.email ? <Text modifiers={[font({ size: 15 }), foregroundStyle({ type: "hierarchical", style: "secondary" })]}>{s.email}</Text> : null}
            </VStack>
          </HStack>
        </Section>

        <Section>
          <LinkRow title="Plan & usage" icon="gauge.with.dots.needle.50percent" color="#34C759" value={s.usageSummary} onPress={s.openUsage} />
        </Section>

        <Section title="Mates">
          <LinkRow title="Memory" icon="brain.head.profile" color="#AF52DE" onPress={s.openMemory} />
          <LinkRow title="Apps" icon="square.grid.2x2" color="#007AFF" onPress={s.openApps} />
          <LinkRow title="Notifications" icon="bell.badge" color="#FF3B30" external onPress={s.openNotifications} />
        </Section>

        <Section title="Appearance">
          <Picker label="Theme" systemImage="circle.lefthalf.filled" selection={s.mode} onSelectionChange={(value: ThemeMode) => s.setTheme(value)} modifiers={[pickerStyle("menu")]}>
            {THEMES.map((theme) => <Text key={theme.value} modifiers={[tag(theme.value)]}>{theme.label}</Text>)}
          </Picker>
        </Section>

        <Section title="About">
          <Button label="View introduction" onPress={s.showIntro} />
        </Section>

        <Section footer={<Text>{`v ${s.version}`}</Text>}>
          <Button label="Sign out" onPress={s.signOut} />
          <Button label={s.deleting ? "Deleting your account…" : "Delete account"} role="destructive" onPress={s.confirmDelete} />
        </Section>
      </Form>
    </Host>
    </>
  );
}

/** Android: Material 3 grouped rows; each section already draws the row surface. */
function AndroidSettings({ s }: { s: Settings }) {
  const title = { color: s.colors.text, fontSize: 17 };
  const muted = { color: s.colors.textMuted, fontSize: 14 };
  const danger = { color: "#E5484D", fontSize: 17 };
  const row = (label: string, onPress?: () => void, style = title, value?: string) => (
    <Row alignment="center" spacing={12} onPress={onPress}>
      <UniversalText textStyle={style}>{label}</UniversalText>
      <UniversalSpacer flexible />
      {value ? <UniversalText textStyle={muted}>{value}</UniversalText> : null}
    </Row>
  );
  return (
    <UniversalHost testID="settings-screen" style={{ flex: 1 }} colorScheme={s.isDark ? "dark" : "light"}>
      <FieldGroup>
        <FieldGroup.Section>
          <Column spacing={2}>
            <UniversalText textStyle={{ color: s.colors.text, fontSize: 20, fontWeight: "600" }}>{s.name}</UniversalText>
            {s.email ? <UniversalText textStyle={muted}>{s.email}</UniversalText> : null}
          </Column>
        </FieldGroup.Section>
        <FieldGroup.Section>
          {row("Plan & usage", s.openUsage, title, s.usageSummary)}
        </FieldGroup.Section>
        <FieldGroup.Section title="Mates">
          {row("Memory", s.openMemory)}
          {row("Apps", s.openApps)}
          {row("Notifications", s.openNotifications)}
        </FieldGroup.Section>
        <FieldGroup.Section title="Appearance">
          <Row alignment="center" spacing={12}>
            <UniversalText textStyle={title}>Theme</UniversalText>
            <UniversalSpacer flexible />
            <UniversalPicker selectedValue={s.mode} onValueChange={(value) => s.setTheme(value as ThemeMode)} appearance="menu">
              {THEMES.map((theme) => <UniversalPicker.Item key={theme.value} label={theme.label} value={theme.value} />)}
            </UniversalPicker>
          </Row>
        </FieldGroup.Section>
        <FieldGroup.Section title="About">
          {row("View introduction", s.showIntro)}
        </FieldGroup.Section>
        <FieldGroup.Section>
          {row("Sign out", s.signOut)}
          {row(s.deleting ? "Deleting your account…" : "Delete account", s.confirmDelete, danger)}
          <FieldGroup.SectionFooter><UniversalText textStyle={muted}>{`v ${s.version}`}</UniversalText></FieldGroup.SectionFooter>
        </FieldGroup.Section>
      </FieldGroup>
    </UniversalHost>
  );
}

export default function SettingsScreen() {
  const settings = useSettings();
  return Platform.OS === "ios" ? <IosSettings s={settings} /> : <AndroidSettings s={settings} />;
}
