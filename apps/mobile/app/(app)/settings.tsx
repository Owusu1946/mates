import { Button, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../src/session/provider";
import { useOnboarding } from "../../src/onboarding/provider";
import { useTheme } from "../../src/theme/provider";

export default function SettingsScreen() {
  const session = useSession();
  const onboarding = useOnboarding();
  const { mode, setMode, colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} testID="settings-screen">
      <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      <Text style={[styles.detail, { color: colors.textSecondary }]}>User: {session.user?.displayName ?? session.user?.id ?? "Guest"}</Text>
      <Text style={[styles.detail, { color: colors.textSecondary }]}>Theme: {mode}</Text>
      <Button title="Apps & connections" onPress={() => router.push("/connections")} color={colors.primary} />
      <Button title="Memory" onPress={() => router.push("/memory")} color={colors.primary} />
      <Button
        title={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
        color={colors.primary}
        onPress={() => setMode(mode === "dark" ? "light" : "dark")}
      />
      <Button title="Show onboarding again" onPress={() => void onboarding.reset().then(() => router.replace("/(onboarding)"))} />
      <Button title="Sign out" onPress={session.signOut} color="#b42318" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 16, backgroundColor: "#f4f6fb" },
  title: { fontSize: 24, fontWeight: "700" },
  detail: { fontSize: 16, color: "#52606d" },
});
