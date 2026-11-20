import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StatusBar, Text, TextInput, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { runRequest } from "../../src/chat/background-chat";
import { CardButton } from "../../src/chat/card-button";
import { ChatIcon } from "../../src/chat/chat-icon";
import { PulseDot } from "../../src/chat/pulse-dot";
import { LiveView, STAGE } from "../../src/computer/live-view";
import { NEEDS_YOU, useComputer, type ComputerKey } from "../../src/computer/use-computer";
import { haptic } from "../../src/haptics";
import { useTheme } from "../../src/theme/provider";

/** The desktop is 4:3 (1024×768). */
const RATIO = 3 / 4;
const KEYS: { key: ComputerKey; label: string }[] = [
  { key: "Enter", label: "Enter" }, { key: "Tab", label: "Tab" }, { key: "Backspace", label: "⌫" }, { key: "Escape", label: "Esc" },
  { key: "Left", label: "←" }, { key: "Up", label: "↑" }, { key: "Down", label: "↓" }, { key: "Right", label: "→" },
];

const message = (error: unknown) => (error instanceof Error ? error.message : "Try again.");

/**
 * The mates' computer, full screen: turn it on, watch it live, use it yourself, take the mouse from
 * a mate and hand it back. One computer per person, shared by all their mates, so this screen isn't
 * tied to a chat.
 */
export default function ComputerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const computer = useComputer({ watching: true });
  const view = computer.view;
  const [busy, setBusy] = useState<string | null>(null);
  const [theater, setTheater] = useState(false);
  const stageWidth = width - 32;
  const stageHeight = Math.round(stageWidth * RATIO);
  const state = view?.state ?? "off";
  const on = state === "on";
  const goal = view?.goal ?? null;
  const mate = computer.driver?.name ?? "Your mate";

  // A small tap when it comes on, so you can look away while it starts.
  const previous = useRef(state);
  useEffect(() => {
    if (previous.current === "starting" && state === "on") haptic.success();
    if (previous.current !== "error" && state === "error") haptic.error();
    previous.current = state;
  }, [state]);
  useEffect(() => {
    if (!on) setTheater(false);
  }, [on]);

  const run = async (action: "start" | "takeover" | "handback" | "stop") => {
    haptic.light();
    setBusy(action);
    try {
      await computer.act(action);
    } catch (error) {
      haptic.error();
      Alert.alert(action === "start" ? "Couldn’t turn it on" : "Couldn’t do that", message(error));
    } finally {
      setBusy(null);
    }
  };
  const turnOff = () =>
    Alert.alert(
      "Turn off the computer?",
      goal ? `${mate}’s task stops too. Your files and sign-ins are kept.` : "Your files and sign-ins are kept. It takes a few seconds to turn back on.",
      [{ text: "Keep it on", style: "cancel" }, { text: "Turn off", style: "destructive", onPress: () => void run("stop") }],
    );

  const pill = !view
    ? null
    : goal?.status === "waiting" && goal.waitingFor !== "user_control"
      ? { label: "Needs you", color: NEEDS_YOU, pulse: true }
      : state === "starting" ? { label: "Starting", color: colors.textSecondary, pulse: true }
        : state === "stopping" ? { label: "Turning off", color: colors.textMuted, pulse: true }
          : state === "error" ? { label: "Problem", color: colors.error, pulse: false }
            : on ? goal && view.controller === "mate" ? { label: "Working", color: computer.driver?.color ?? colors.text, pulse: true } : { label: "On", color: colors.primary, pulse: false }
              : { label: "Off", color: colors.textMuted, pulse: false };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, paddingHorizontal: 16, gap: 14 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ color: colors.text, fontFamily: "DMSans_700Bold", fontSize: 22 }}>Computer</Text>
          {pill && (
            <Animated.View key={pill.label} entering={FadeIn.duration(160)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: colors.surfaceElevated }}>
              {pill.pulse ? <PulseDot color={pill.color} size={7} /> : <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: pill.color }} />}
              <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_600SemiBold", fontSize: 12.5 }}>{pill.label}</Text>
            </Animated.View>
          )}
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
            <ChatIcon name="close" color={colors.text} size={24} />
          </Pressable>
        </View>

        {!!goal && (
          <Animated.View entering={FadeIn.duration(180)} layout={LinearTransition.duration(200)} style={{ gap: 2 }}>
            <Text numberOfLines={1} style={{ color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 15 }}>
              {goal.status === "waiting" ? goal.waitingFor === "user_control" ? "You have the mouse" : `${mate} needs you` : goal.step ?? "Starting"}
            </Text>
            <Text numberOfLines={2} style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13 }}>{goal.goal}</Text>
          </Animated.View>
        )}

        <View style={{ height: stageHeight, borderRadius: 16, overflow: "hidden", backgroundColor: STAGE, borderWidth: computer.userHasControl ? 2 : 0, borderColor: colors.primary }}>
          {!computer.available && !computer.loading ? (
            <Placeholder title="The computer comes with Pro and Max" body="A desktop of your own in the cloud, with Chrome, documents and files. Your mates use it for you, and you can too." />
          ) : on && theater ? (
            // One stream at a time: two viewers on one desktop can bump each other off.
            <Placeholder title="Showing full screen" body="Close full screen to come back here." />
          ) : on ? (
            <LiveView url={view?.liveUrl ?? null} interactive={computer.userHasControl} height={stageHeight - (computer.userHasControl ? 4 : 0)} onStale={() => void computer.refresh()} />
          ) : state === "starting" ? (
            <Boot since={view?.since ?? null} setup={!!view?.setup} />
          ) : state === "stopping" ? (
            <Placeholder title="Turning off…" body="Your files and sign-ins are kept for next time." spinner />
          ) : state === "error" ? (
            <Placeholder title="Your computer hit a problem" body={view?.error ?? "Something went wrong."}>
              <CardButton label={busy === "start" ? "Starting…" : "Try again"} onPress={() => void run("start")} disabled={!!busy} />
            </Placeholder>
          ) : (
            <PowerOn onPress={() => void run("start")} busy={busy === "start" || computer.loading} />
          )}
          {on && !theater && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Expand the screen"
              onPress={() => { haptic.light(); setTheater(true); }}
              hitSlop={8}
              style={({ pressed }) => ({ position: "absolute", right: 10, bottom: 10, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(9,9,11,0.72)", opacity: pressed ? 0.6 : 1 })}
            >
              <ChatIcon name="expand" color="#fafafa" size={18} />
            </Pressable>
          )}
        </View>

        {on && (
          <Animated.View entering={FadeIn.duration(200)} layout={LinearTransition.duration(200)} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ChatIcon name="cursor" color={computer.userHasControl ? colors.primary : colors.textSecondary} size={18} />
              <Text numberOfLines={2} style={{ flex: 1, color: colors.textSecondary, fontFamily: "DMSans_500Medium", fontSize: 13.5, lineHeight: 18 }}>
                {computer.userHasControl
                  ? goal ? `You have the mouse. ${mate} is paused.` : "You’re in control. Tap to click, drag to move, two fingers to scroll."
                  : `${mate} has the mouse. Take over any time.`}
              </Text>
            </View>
            {computer.userHasControl
              ? goal && <CardButton label={busy === "handback" ? "Handing back…" : `Hand back`} onPress={() => void run("handback")} disabled={!!busy} />
              : <CardButton label={busy === "takeover" ? "Taking over…" : "Take over"} onPress={() => void run("takeover")} disabled={!!busy} />}
          </Animated.View>
        )}

        {goal?.status === "waiting" && goal.waitingFor !== "user_control" && <Waiting goalId={goal.id} kind={goal.waitingFor} question={goal.question} onTakeOver={() => void run("takeover")} userHasControl={computer.userHasControl} />}

        {computer.userHasControl && <Keyboard privateByDefault={goal?.waitingFor === "login"} type={computer.type} />}

        {view && (on || state === "starting" || state === "error") && (
          <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 4 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Turn off the computer" disabled={!!busy} onPress={turnOff} hitSlop={8}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, opacity: busy ? 0.4 : pressed ? 0.5 : 1 })}>
              <ChatIcon name="power" color={colors.textMuted} size={16} />
              <Text style={{ color: colors.textMuted, fontFamily: "DMSans_600SemiBold", fontSize: 13.5 }}>{busy === "stop" ? "Turning off…" : "Turn off"}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {theater && on && (
        <Theater
          url={view?.liveUrl ?? null}
          interactive={computer.userHasControl}
          onClose={() => setTheater(false)}
          onStale={() => void computer.refresh()}
          caption={computer.userHasControl ? null : goal?.step ?? null}
        />
      )}
    </View>
  );
}

/** Off: one big button. */
function PowerOn({ onPress, busy }: { onPress: () => void; busy: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 24 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Turn on your computer"
        disabled={busy}
        onPress={onPress}
        style={({ pressed }) => ({ width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", backgroundColor: "#fafafa", opacity: busy ? 0.5 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] })}
      >
        <ChatIcon name="power" color={STAGE} size={30} />
      </Pressable>
      <View style={{ alignItems: "center", gap: 4 }}>
        <Text style={{ color: "#fafafa", fontFamily: "DMSans_600SemiBold", fontSize: 15 }}>Turn on your computer</Text>
        <Text style={{ color: "#a1a1aa", fontFamily: "DMSans_400Regular", fontSize: 12.5, textAlign: "center", lineHeight: 17 }}>
          Chrome, documents and files, kept between sessions. Your mates use it too.
        </Text>
      </View>
    </View>
  );
}

const BOOT_STEPS = [
  { at: 0, label: "Waking your computer" },
  { at: 4, label: "Powering on" },
  { at: 12, label: "Starting the desktop" },
  { at: 25, label: "Opening the screen" },
  { at: 45, label: "Almost there" },
];

/** Starting: a breathing ring, what it's doing, and how long it's been, so the wait feels short and honest. */
function Boot({ since, setup }: { since: string | null; setup: boolean }) {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!reducedMotion) pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse, reducedMotion]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.25 + pulse.value * 0.5, transform: [{ scale: 1 + pulse.value * 0.18 }] }));
  const started = since ? new Date(since).getTime() : now;
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  const step = setup && seconds < 20 ? "Setting up your computer for the first time" : [...BOOT_STEPS].reverse().find((s) => seconds >= s.at)!.label;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <View style={{ width: 68, height: 68, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={[{ position: "absolute", width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: "#fafafa" }, ring]} />
        <ChatIcon name="power" color="#fafafa" size={28} />
      </View>
      <View style={{ alignItems: "center", gap: 4 }}>
        <Animated.Text key={step} entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ color: "#fafafa", fontFamily: "DMSans_600SemiBold", fontSize: 15 }}>{step}…</Animated.Text>
        <Text style={{ color: "#71717a", fontFamily: "DMSans_500Medium", fontSize: 12.5, fontVariant: ["tabular-nums"] }}>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}{setup ? " · about a minute the first time" : ""}
        </Text>
      </View>
    </View>
  );
}

function Placeholder({ title, body, spinner, children }: { title: string; body: string; spinner?: boolean; children?: React.ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 28 }}>
      {spinner && <PulseDot color="#a1a1aa" size={10} />}
      <Text style={{ color: "#fafafa", fontFamily: "DMSans_600SemiBold", fontSize: 15, textAlign: "center" }}>{title}</Text>
      <Text style={{ color: "#a1a1aa", fontFamily: "DMSans_400Regular", fontSize: 13, textAlign: "center", lineHeight: 18 }}>{body}</Text>
      {children}
    </View>
  );
}

/** A mate is waiting on you: approve, sign in, or answer, right here. */
function Waiting({ goalId, kind, question, onTakeOver, userHasControl }: {
  goalId: string; kind: "login" | "approval" | "question" | "user_control" | null; question: string | null; onTakeOver: () => void; userHasControl: boolean;
}) {
  const { colors } = useTheme();
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const post = async (body: unknown) => {
    setBusy(true);
    try {
      await runRequest(getToken, `computer/goals/${goalId}/reply`, body);
      haptic.success();
      setReply("");
      await Promise.all([client.invalidateQueries({ queryKey: ["computer", userId] }), client.invalidateQueries({ queryKey: ["computer-goal", userId, goalId] })]);
    } catch (error) {
      Alert.alert("Couldn’t send that", message(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Animated.View entering={FadeIn.duration(180)} layout={LinearTransition.duration(200)} style={{ gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <PulseDot color={NEEDS_YOU} size={8} />
        <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 14 }}>
          {kind === "approval" ? "Your OK is needed" : kind === "login" ? "Sign in to continue" : "A quick question"}
        </Text>
      </View>
      {!!question && <Text style={{ color: colors.text, fontFamily: "DMSans_400Regular", fontSize: 14.5, lineHeight: 21 }}>{question}</Text>}
      {kind === "approval" && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <CardButton label="Approve" onPress={() => void post({ choice: "approve" })} disabled={busy} />
          <CardButton label="Decline" variant="outlined" onPress={() => void post({ choice: "decline" })} disabled={busy} />
        </View>
      )}
      {kind === "login" && (
        <View style={{ gap: 10 }}>
          {!userHasControl && <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>Take over, tap the field on the screen, and type below. Your mate never sees what you type.</Text>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {!userHasControl && <CardButton label="Take over" onPress={onTakeOver} disabled={busy} />}
            <CardButton label="I’m done, continue" variant={userHasControl ? "filled" : "outlined"} onPress={() => void post({ choice: "continue" })} disabled={busy} />
          </View>
        </View>
      )}
      {kind === "question" && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput value={reply} onChangeText={setReply} placeholder="Your answer" placeholderTextColor={colors.textMuted} returnKeyType="send"
            onSubmitEditing={() => reply.trim() && void post({ text: reply.trim() })}
            style={{ flex: 1, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 }} />
          <CardButton label="Send" onPress={() => void post({ text: reply.trim() })} disabled={busy || !reply.trim()} />
        </View>
      )}
    </Animated.View>
  );
}

/** Typing into the computer: straight to the focused field, never saved or shown to a mate. */
function Keyboard({ privateByDefault, type }: { privateByDefault: boolean; type: (input: { text?: string; key?: ComputerKey }) => Promise<unknown> }) {
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const [hidden, setHidden] = useState(privateByDefault);
  const [sending, setSending] = useState(false);
  useEffect(() => setHidden(privateByDefault), [privateByDefault]);
  const send = async (input: { text?: string; key?: ComputerKey }) => {
    if (input.key) haptic.selection();
    if (input.text) setSending(true);
    try {
      await type(input);
      if (input.text) setText("");
    } catch (error) {
      Alert.alert("Couldn’t type that", message(error));
    } finally {
      setSending(false);
    }
  };
  return (
    <Animated.View entering={FadeIn.duration(200)} layout={LinearTransition.duration(200)} style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingLeft: 12, paddingRight: 6, backgroundColor: colors.surface }}>
        <ChatIcon name="keyboard" color={colors.textMuted} size={18} />
        <TextInput
          value={text}
          onChangeText={setText}
          secureTextEntry={hidden}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={() => text && void send({ text })}
          placeholder="Type into the selected field"
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.text, paddingVertical: 12, fontSize: 15 }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={hidden ? "Show what I type" : "Hide what I type"} hitSlop={6} onPress={() => setHidden((v) => !v)} style={{ paddingHorizontal: 6, paddingVertical: 8 }}>
          <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_600SemiBold", fontSize: 12.5 }}>{hidden ? "Show" : "Hide"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Type it" disabled={!text || sending} onPress={() => void send({ text })}
          style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: text ? colors.text : colors.surfaceElevated, opacity: pressed ? 0.7 : 1 })}>
          <ChatIcon name="arrowUp" color={text ? colors.background : colors.textMuted} size={18} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
        {KEYS.map((k) => (
          <Pressable key={k.key} accessibilityRole="button" accessibilityLabel={k.key} onPress={() => void send({ key: k.key })}
            style={({ pressed }) => ({ minWidth: 44, height: 36, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.border : colors.surfaceElevated })}>
            <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 13.5 }}>{k.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>Tap a field on the screen first. What you type goes straight there and isn’t saved or shown to your mates.</Text>
    </Animated.View>
  );
}

/**
 * The screen as big as the phone allows: turned on its side across the whole display, without
 * needing the app itself to rotate. Touches still land in the right place.
 */
function Theater({ url, interactive, onClose, onStale, caption }: { url: string | null; interactive: boolean; onClose: () => void; onStale: () => void; caption: string | null }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Sideways, the phone's height is the stage's width; fit 4:3 inside it.
  const long = height - insets.top - insets.bottom;
  const stageWidth = Math.min(long, Math.round(width / RATIO));
  const stageHeight = Math.round(stageWidth * RATIO);
  return (
    <Modal visible animationType="fade" supportedOrientations={["portrait"]} statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />
      <View style={{ flex: 1, backgroundColor: STAGE, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: stageWidth, height: stageHeight, transform: [{ rotate: "90deg" }] }}>
          <LiveView url={url} interactive={interactive} width={stageWidth} height={stageHeight} onStale={onStale} />
        </View>
        {!!caption && (
          <View pointerEvents="none" style={{ position: "absolute", left: 8, top: 0, bottom: 0, justifyContent: "center" }}>
            <Text numberOfLines={1} style={{ color: "#a1a1aa", fontFamily: "DMSans_500Medium", fontSize: 12, transform: [{ rotate: "90deg" }], width: 280, textAlign: "center" }}>{caption}</Text>
          </View>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Leave full screen" onPress={() => { haptic.light(); onClose(); }} hitSlop={10}
          style={({ pressed }) => ({ position: "absolute", left: 12, bottom: insets.bottom + 12, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(250,250,250,0.12)", opacity: pressed ? 0.6 : 1, transform: [{ rotate: "90deg" }] })}>
          <ChatIcon name="collapse" color="#fafafa" size={20} />
        </Pressable>
      </View>
    </Modal>
  );
}
