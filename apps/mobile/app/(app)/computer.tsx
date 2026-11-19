import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CardButton } from "../../src/chat/card-button";
import { ChatIcon } from "../../src/chat/chat-icon";
import { PulseDot } from "../../src/chat/pulse-dot";
import { LiveView } from "../../src/computer/live-view";
import { NEEDS_YOU, useComputer } from "../../src/computer/use-computer";
import { haptic } from "../../src/haptics";
import { useTheme } from "../../src/theme/provider";

/**
 * The mates' computer, full screen: watch it live, take the mouse, type privately, hand it back.
 * One computer per person, shared by all their mates, so this screen isn't tied to a chat.
 */
export default function ComputerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const computer = useComputer();
  const view = computer.view;
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [hidden, setHidden] = useState(true);
  const liveWidth = width - 32;
  // The desktop is 4:3 (1024×768).
  const liveHeight = Math.round((liveWidth * 3) / 4);

  const run = async (action: "takeover" | "handback" | "stop") => {
    haptic.light();
    setBusy(true);
    try {
      await computer.act(action);
      if (action === "handback") setText("");
    } catch (error) {
      Alert.alert("Couldn’t do that", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };
  const send = async (input: { text?: string; key?: "Enter" | "Tab" | "Backspace" | "Escape" }) => {
    try {
      await computer.type(input);
      if (input.text) setText("");
    } catch (error) {
      Alert.alert("Couldn’t type that", error instanceof Error ? error.message : "Try again.");
    }
  };
  const stop = () =>
    Alert.alert("Stop the computer?", view?.goal ? "The task it’s working on stops too." : "It turns on again when a mate needs it.", [
      { text: "Keep it on", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: () => void run("stop") },
    ]);

  const status = !view
    ? computer.available ? "Loading…" : "The computer comes with Pro and Max."
    : view.goal
      ? view.goal.status === "waiting"
        ? view.goal.waitingFor === "user_control" ? "You have the mouse" : `${computer.driver?.name ?? "Your mate"} needs you`
        : view.goal.step ?? view.goal.goal
      : view.state === "on" ? "On, nothing running" : view.state === "starting" ? "Waking your computer…" : view.state === "error" ? (view.error ?? "Something went wrong") : "Off";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, paddingHorizontal: 16, gap: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.text, fontFamily: "DMSans_700Bold", fontSize: 22 }}>Computer</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
            <ChatIcon name="close" color={colors.text} size={24} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {computer.working ? <PulseDot color={computer.driver?.color ?? colors.text} size={10} /> : computer.needsYou ? <PulseDot color={NEEDS_YOU} size={10} /> : null}
          <Text numberOfLines={2} style={{ flex: 1, color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 15 }}>{status}</Text>
        </View>
        {!!view?.goal && <Text numberOfLines={2} style={{ color: colors.textMuted, fontSize: 13, marginTop: -8 }}>{view.goal.goal}</Text>}

        <LiveView url={view?.liveUrl ?? null} interactive={computer.userHasControl} height={liveHeight} />

        {view && view.state === "on" && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {computer.userHasControl
              ? <CardButton label={computer.driver ? `Hand back to ${computer.driver.name}` : "Hand back"} onPress={() => void run("handback")} disabled={busy} />
              : <CardButton label="Take over" onPress={() => void run("takeover")} disabled={busy} />}
            <CardButton label="Stop" variant="outlined" onPress={stop} disabled={busy} />
          </View>
        )}

        {computer.userHasControl && (
          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
              Tap a field on the screen, then type here. It goes straight to that field and isn’t saved or shown to your mates.
            </Text>
            <TextInput
              value={text}
              onChangeText={setText}
              secureTextEntry={hidden}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Type into the selected field"
              placeholderTextColor={colors.textMuted}
              style={{ color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14 }}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <CardButton label="Type it" onPress={() => void send({ text })} disabled={!text} />
              <CardButton label="Enter" variant="outlined" onPress={() => void send({ key: "Enter" })} />
              <CardButton label="Tab" variant="outlined" onPress={() => void send({ key: "Tab" })} />
              <CardButton label="Delete" variant="outlined" onPress={() => void send({ key: "Backspace" })} />
              <CardButton label={hidden ? "Show text" : "Hide text"} variant="text" onPress={() => setHidden((v) => !v)} />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
