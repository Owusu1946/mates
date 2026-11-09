import {
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react-native";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import Markdown from "react-native-markdown-display";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AccessibilityInfo,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Drawer, useDrawerProgress } from "react-native-drawer-layout";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { CooperMark } from "../components/auth/cooper-mark";
import { EmptyChatAvatar } from "../components/polygon-avatar/empty-chat-avatar";
import { useTheme } from "../theme/provider";
import { ChatIcon } from "./chat-icon";
import { ChatSyncNotice } from "./chat-sync";
import { ToolWorkflowCard } from "./workflow-card";
import { AppResponseCard } from "./app-results";
import { BrowserCard } from "./browser-card";
import type { WorkflowCard } from "@expojet/api-contract";
import { useAuth } from "@clerk/expo";
import { cancelBackgroundChat } from "./background-chat";
import { ScheduleCard } from "./schedule-card";
import { MemoryCard } from "./memory-card";
import { PlanCard } from "./plan-card";
import { MatesList } from "./drawer-mates-list";
import { DEFAULT_GRADIENT, useChats, useCurrentChat, useMates, type ChatSummary } from "../mates/data";
import { Glow } from "../onboarding/glow";
import { GroupAvatar, MateAvatar } from "../mates/mate-avatar";
import { MissionBanner, TeamCard } from "../mates/mission";
import { HandoffCard, NoteChip } from "../mates/relay";
import { CodeCard } from "./code-card";
import { SourcesCard } from "./sources-card";
import * as WebBrowser from "expo-web-browser";
import { readCache, writeCache } from "../data/offline-cache";
import { ComposerTextInput } from "./composer-input";
import { ActionApproval } from "./action-approval";
import { AppLogo } from "../connections/app-connection";
import { createApiClient } from "../data/api";
import type { AppConnection } from "@expojet/api-contract";
import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { LiquidGlassButton } from "../components/ui/liquid-glass-button";
import * as Haptics from "expo-haptics";
import { VoiceDictationBar } from "./voice-dictation-bar";
import { useDictation } from "./use-dictation";
import {
  startVoiceTranscription,
  type VoiceTranscriptionSession,
} from "./voice-transcription";
import { ComposerPlusMenu, type PlusMenuOption } from "./composer-plus-menu";
import { ComposerCameraSheet } from "./composer-camera-sheet";
import { ComposerAttachmentChip, MessageAttachments } from "./attachment-views";
import { DOCUMENT_TYPES, MAX_ATTACHMENTS, prepareImage, uploadAttachment, type UploadSource } from "./attachments";

// Finora's chat palette, scoped to this screen.
const palettes = {
  light: {
    background: "#ffffff",
    foreground: "#18181b",
    muted: "#f4f4f5",
    mutedForeground: "#71717a",
    border: "#e4e4e7",
    composer: "#fafafa",
    primary: "#18181b",
    primaryForeground: "#fafafa",
    destructive: "#dc2626",
    destructiveSurface: "rgba(220, 38, 38, 0.08)",
  },
  dark: {
    background: "#18181b",
    foreground: "#fafafa",
    muted: "#3f3f46",
    mutedForeground: "#a1a1aa",
    border: "rgba(255, 255, 255, 0.1)",
    composer: "#232326",
    primary: "#e4e4e7",
    primaryForeground: "#18181b",
    destructive: "#f87171",
    destructiveSurface: "rgba(248, 113, 113, 0.12)",
  },
};

function useChatColors() {
  const { isDark } = useTheme();
  return isDark ? palettes.dark : palettes.light;
}

type ChatIconName = React.ComponentProps<typeof ChatIcon>["name"];
type ChatPalette = (typeof palettes)["light"];

const EMPTY_CHAT_WIDTH = 340;
const EMPTY_CHAT_AVATAR_SIZE = 104;

const EMPTY_SUGGESTION_INTERVAL_MS = 4_000;
const EMPTY_PROMPT_BLOCK_HEIGHT = 120;
const EMPTY_PROMPT_OUT_MS = 160;
const EMPTY_PROMPT_IN_MS = 240;
const EMPTY_PROMPT_VERTICAL_PADDING = 18;
const EMPTY_SCREEN_TAP_GLOW_SIZE = 360;

const suggestionSpots: { prompt: string; chip: string; icon: ChatIconName }[] = [
  { prompt: "Help me plan my week", chip: "Plan", icon: "tasks" },
  { prompt: "Help me explore an idea", chip: "Explore", icon: "ideas" },
  { prompt: "Help me draft something", chip: "Draft", icon: "compose" },
  { prompt: "Help me think this through", chip: "Think", icon: "feed" },
];

function glowColorForChat(chat: ChatSummary | null): string {
  if (chat?.kind === "group" && chat.members[0]) return chat.members[0].gradient[1];
  if (chat?.mate) return chat.mate.gradient[1];
  return DEFAULT_GRADIENT[1];
}

function EmptyChatRotatingPrompt({
  index,
  colors,
  accent,
  reducedMotion,
}: {
  index: number;
  colors: ChatPalette;
  accent: string;
  reducedMotion: boolean;
}) {
  const [displayed, setDisplayed] = useState(index);
  const spot = suggestionSpots[displayed]!;
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const settledIndex = useRef(index);

  useEffect(() => {
    if (reducedMotion) {
      setDisplayed(index);
      settledIndex.current = index;
      opacity.value = 1;
      translateY.value = 0;
      scale.value = 1;
      return;
    }
    if (settledIndex.current === index) return;
    settledIndex.current = index;

    const arrive = (next: number) => {
      setDisplayed(next);
      translateY.value = 4;
      scale.value = 0.99;
      const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
      opacity.value = withTiming(1, { duration: EMPTY_PROMPT_IN_MS, easing: easeOut });
      translateY.value = withTiming(0, { duration: EMPTY_PROMPT_IN_MS, easing: easeOut });
      scale.value = withTiming(1, { duration: EMPTY_PROMPT_IN_MS, easing: easeOut });
    };
    opacity.value = withTiming(0, { duration: EMPTY_PROMPT_OUT_MS, easing: Easing.inOut(Easing.quad) }, (done) => {
      if (done) runOnJS(arrive)(index);
    });
  }, [index, reducedMotion, opacity, scale, translateY]);

  const motion = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));
  return (
    <ThreadPrimitive.Suggestion
      prompt={spot.prompt}
      send
      accessibilityLabel={`Send suggestion: ${spot.prompt}`}
      style={({ pressed }: { pressed: boolean }) => ({
        width: "100%",
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Animated.View style={[{ width: "100%", alignItems: "center" }, motion]}>
        <View style={{ width: "100%", paddingVertical: EMPTY_PROMPT_VERTICAL_PADDING }}>
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              backgroundColor: colors.composer,
              borderRadius: 26,
              borderCurve: "continuous",
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              paddingHorizontal: 16,
              paddingVertical: 16,
            }}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <View style={{ ...StyleSheet.absoluteFill, backgroundColor: accent, opacity: 0.16 }} />
              <ChatIcon name={spot.icon} color={accent} size={22} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                style={{
                  color: accent,
                  fontFamily: "DMSans_600SemiBold",
                  fontSize: 12,
                  letterSpacing: 0.4,
                }}
              >
                {spot.chip}
              </Text>
              <Text
                style={{
                  color: colors.foreground,
                  fontFamily: "DMSans_600SemiBold",
                  fontSize: 16,
                  lineHeight: 21,
                  letterSpacing: -0.3,
                }}
              >
                {spot.prompt}
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </ThreadPrimitive.Suggestion>
  );
}

function MessageActions({ user }: { user: boolean }) {
  const colors = useChatColors();
  const branchNumber = useAuiState((state) => state.message.branchNumber);
  const branchCount = useAuiState((state) => state.message.branchCount);
  // Resuming a task (approve, connect, pick) continues the reply; it is not an alternative answer.
  const resumed = useAuiState(
    (state) => (state.message.metadata as { custom?: { resumed?: boolean } } | undefined)?.custom?.resumed === true,
  );
  const iconButton = {
    width: 28,
    height: 28,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 14,
  };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        marginTop: 6,
        marginLeft: -4,
      }}
    >
      {branchCount > 1 && !resumed && (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <BranchPickerPrimitive.Previous
            style={{ padding: 4, opacity: branchNumber <= 1 ? 0.35 : 1 }}
          >
            <ChatIcon
              name="previous"
              color={colors.mutedForeground}
              size={16}
            />
          </BranchPickerPrimitive.Previous>
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: "DMSans_400Regular",
              fontSize: 13,
              fontVariant: ["tabular-nums"],
            }}
          >
            <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
          </Text>
          <BranchPickerPrimitive.Next
            style={{
              padding: 4,
              opacity: branchNumber >= branchCount ? 0.35 : 1,
            }}
          >
            <ChatIcon name="next" color={colors.mutedForeground} size={16} />
          </BranchPickerPrimitive.Next>
        </View>
      )}
      <ActionBarPrimitive.Copy
        copyToClipboard={async (value) => {
          await Clipboard.setStringAsync(value);
        }}
        style={iconButton}
      >
        {({ isCopied }) => (
          <ChatIcon
            name={isCopied ? "check" : "copy"}
            color={isCopied ? colors.foreground : colors.mutedForeground}
            size={16}
          />
        )}
      </ActionBarPrimitive.Copy>
      {user ? (
        <ActionBarPrimitive.Edit style={iconButton}>
          <ChatIcon name="edit" color={colors.mutedForeground} size={16} />
        </ActionBarPrimitive.Edit>
      ) : (
        <>
          <ActionBarPrimitive.Reload style={iconButton}>
            <ChatIcon name="reload" color={colors.mutedForeground} size={16} />
          </ActionBarPrimitive.Reload>
          <ActionBarPrimitive.FeedbackPositive style={iconButton}>
            <ChatIcon
              name="thumbsUp"
              color={colors.mutedForeground}
              size={16}
            />
          </ActionBarPrimitive.FeedbackPositive>
          <ActionBarPrimitive.FeedbackNegative style={iconButton}>
            <ChatIcon
              name="thumbsDown"
              color={colors.mutedForeground}
              size={16}
            />
          </ActionBarPrimitive.FeedbackNegative>
        </>
      )}
    </View>
  );
}

function ThinkingIndicator() {
  const running = useAuiState(
    (state) => state.message.status?.type === "running",
  );
  const parts = useAuiState((state) => state.message.parts);
  const colors = useChatColors();
  if (!running) return null;
  if (parts.some((part) => part.type === "tool-call")) return null;
  const composing = parts.some((part) => part.type === "text");
  const label = composing
    ? "Writing a response..."
    : "Thinking through that...";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 8,
      }}
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
    >
      <View
        style={{
          width: 20,
          height: 20,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View style={{ width: 50, height: 50, transform: [{ scale: 0.4 }] }}>
          <CooperMark compact />
        </View>
      </View>
      <Text
        style={{
          color: colors.mutedForeground,
          fontFamily: "DMSans_400Regular",
          fontSize: 15,
          lineHeight: 20,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function MessageEditComposer() {
  const colors = useChatColors();
  return (
    <View
      style={{
        width: "100%",
        borderRadius: 32,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.composer,
        padding: 10,
        gap: 8,
      }}
    >
      <ComposerTextInput
        autoFocus
        multiline
        maxLength={4000}
        placeholder="Edit message…"
        placeholderTextColor={colors.mutedForeground}
        style={{
          color: colors.foreground,
          fontFamily: "DMSans_400Regular",
          fontSize: 17,
          lineHeight: 22,
          minHeight: 28,
          maxHeight: 132,
          paddingHorizontal: 10,
          paddingVertical: 6,
        }}
      />
      <View
        style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}
      >
        <ComposerPrimitive.Cancel
          accessibilityLabel="Cancel edit"
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.mutedForeground, fontSize: 18 }}>×</Text>
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send
          accessibilityLabel="Save edit"
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChatIcon name="check" color={colors.primaryForeground} size={16} />
        </ComposerPrimitive.Send>
      </View>
    </View>
  );
}

function useConnectedMentionApps() {
  const { getToken, userId } = useAuth();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const api = useMemo(() => createApiClient(() => tokenRef.current()), []);
  return useQuery({
    queryKey: ["connected-apps", userId, "mentions"],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const apps: AppConnection[] = [];
      let cursor: string | undefined;
      do {
        const response = await api.v1.apps.$get({
          query: { connected: "true", ...(cursor ? { cursor } : {}) },
        });
        if (!response.ok) throw new Error("Couldn’t load connected apps.");
        const page = (await response.json()) as {
          apps: AppConnection[];
          nextCursor: string | null;
        };
        apps.push(...page.apps.filter((app) => app.connected || app.noAuth));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return apps;
    },
  });
}

function UserText({ text }: { text: string }) {
  const colors = useChatColors();
  const appsQuery = useConnectedMentionApps();
  const routedApp = (appsQuery.data ?? [])
    .filter((app) => text.endsWith(`@${app.name}`))
    .sort((a, b) => b.name.length - a.name.length)[0];
  const visibleText = routedApp
    ? text.slice(0, -(`@${routedApp.name}`.length)).trimEnd()
    : text;
  const likelyLong = visibleText.length > 240 || visibleText.split("\n").length > 6;
  const [collapsible, setCollapsible] = useState(likelyLong);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setCollapsible(likelyLong);
    setExpanded(false);
  }, [likelyLong, visibleText]);
  return (
    <View style={{ alignItems: "flex-start", gap: 7 }}>
      <Text
        selectable
        numberOfLines={collapsible && !expanded ? 6 : undefined}
        onTextLayout={(event) => {
          if (event.nativeEvent.lines.length > 6) setCollapsible(true);
        }}
        style={{
          color: colors.foreground,
          fontFamily: "DMSans_400Regular",
          fontSize: 17,
          lineHeight: 22,
        }}
      >
        {visibleText}
      </Text>
      {routedApp && (
        <View
          accessibilityLabel={`Sent to ${routedApp.name}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
        >
          <AppLogo name={routedApp.name} logo={routedApp.logo} size={24} />
          <Text
            style={{
              color: colors.foreground,
              fontFamily: "DMSans_500Medium",
              fontSize: 14,
            }}
          >
            {routedApp.name}
          </Text>
        </View>
      )}
      {collapsible && (
        <Pressable
          accessibilityLabel={
            expanded ? "Show less of this message" : "Show all of this message"
          }
          onPress={() => setExpanded((current) => !current)}
          hitSlop={8}
          style={{ minHeight: 24, justifyContent: "center" }}
        >
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: "DMSans_600SemiBold",
              fontSize: 13,
            }}
          >
            {expanded ? "Show less" : "Show more"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function ChatMessage() {
  const role = useAuiState((state) => state.message.role);
  const running = useAuiState(
    (state) => state.message.status?.type === "running",
  );
  const editing = useAuiState((state) => state.message.composer.isEditing);
  const hasContent = useAuiState((state) =>
    state.message.content.some((part) => part.type !== "text" || part.text.trim().length > 0),
  );
  const colors = useChatColors();
  const user = role === "user";
  return (
    <MessagePrimitive.Root
      style={{
        alignItems: user ? "flex-end" : "stretch",
        width: "100%",
      }}
    >
      {user && !editing && <MessageAttachments colors={colors} />}
      {editing ? (
        <MessageEditComposer />
      ) : user && !hasContent ? null : (
        <View
          style={{
            width: user ? undefined : "100%",
            maxWidth: user ? "82%" : "100%",
            backgroundColor: user ? colors.muted : "transparent",
            borderRadius: user ? 22 : 0,
            borderCurve: "continuous",
            borderWidth: user ? StyleSheet.hairlineWidth : 0,
            borderColor: colors.border,
            paddingHorizontal: user ? 16 : 2,
            paddingVertical: user ? 12 : 2,
          }}
        >
          <MessagePrimitive.Content
            renderToolCall={({ part }) =>
              part.result ? (
                (part.result as WorkflowCard).kind === "approval" ? <ActionApproval state={part.result as WorkflowCard} /> : (part.result as WorkflowCard).kind === "speaker" ? <SpeakerLabel state={part.result as WorkflowCard} /> : (part.result as WorkflowCard).kind === "team" ? <TeamCard state={part.result as WorkflowCard} /> : (part.result as WorkflowCard).kind === "handoff" ? <HandoffCard state={part.result as WorkflowCard} /> : (part.result as WorkflowCard).kind === "note" ? <NoteChip state={part.result as WorkflowCard} /> : (part.result as WorkflowCard).kind === "code" ? <CodeCard state={part.result as WorkflowCard} /> : (part.result as WorkflowCard).kind === "sources" ? <SourcesCard state={part.result as WorkflowCard} /> : (part.result as WorkflowCard).kind === "memory" ? <MemoryCard state={part.result as WorkflowCard} /> : (part.result as WorkflowCard).kind === "plan" ? <PlanCard state={part.result as WorkflowCard} /> : (part.result as WorkflowCard).kind === "schedule" ? <ScheduleCard state={part.result as WorkflowCard} /> : (part.result as WorkflowCard).kind === "browser" ? <BrowserCard state={part.result as WorkflowCard} /> : ["choice", "results"].includes(
                  (part.result as WorkflowCard).kind,
                ) ? (
                  <AppResponseCard state={part.result as WorkflowCard} />
                ) : (
                  <ToolWorkflowCard state={part.result as WorkflowCard} />
                )
              ) : (
                <></>
              )
            }
            renderText={({ part }) =>
              user ? (
                <UserText text={part.text} />
              ) : (
                <Markdown
                  // Links, including source citations, open in the in-app browser.
                  onLinkPress={(url) => {
                    if (url.startsWith("https://") || url.startsWith("http://")) void WebBrowser.openBrowserAsync(url);
                    return false;
                  }}
                  style={{
                    // Citations arrive as [site](url) links: quiet, like source chips.
                    link: {
                      color: colors.mutedForeground,
                      fontFamily: "DMSans_500Medium",
                      fontSize: 14,
                      textDecorationLine: "none",
                    },
                    body: {
                      color: colors.foreground,
                      fontFamily: "DMSans_400Regular",
                      fontSize: 17,
                      lineHeight: 25,
                      letterSpacing: -0.2,
                    },
                    paragraph: {
                      color: colors.foreground,
                      fontFamily: "DMSans_400Regular",
                      fontSize: 17,
                      lineHeight: 25,
                      marginTop: 0,
                      marginBottom: 10,
                    },
                    strong: {
                      color: colors.foreground,
                      fontFamily: "DMSans_700Bold",
                    },
                    code_inline: {
                      color: colors.foreground,
                      backgroundColor: colors.muted,
                      fontFamily: "monospace",
                      fontSize: 15,
                    },
                    fence: {
                      color: colors.foreground,
                      backgroundColor: colors.muted,
                      fontFamily: "monospace",
                      fontSize: 14,
                      borderRadius: 18,
                      padding: 12,
                    },
                    blockquote: {
                      color: colors.foreground,
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                      borderLeftWidth: 3,
                      padding: 12,
                    },
                  }}
                >
                  {part.text}
                </Markdown>
              )
            }
          />
        </View>
      )}
      {!user && <ThinkingIndicator />}
      <ErrorPrimitive.Root
        style={{
          marginTop: 8,
          padding: 12,
          borderRadius: 18,
          borderCurve: "continuous",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.destructive,
          backgroundColor: colors.destructiveSurface,
        }}
      >
        <Text
          selectable
          style={{ color: colors.destructive, fontSize: 15, lineHeight: 20 }}
        >
          Cooper couldn’t reply. Please try again.
        </Text>
        <ActionBarPrimitive.Reload
          accessibilityLabel="Retry response"
          style={{ alignSelf: "flex-start", paddingTop: 8 }}
        >
          <Text
            style={{
              color: colors.foreground,
              fontSize: 14,
              fontFamily: "DMSans_600SemiBold",
            }}
          >
            Try again
          </Text>
        </ActionBarPrimitive.Reload>
      </ErrorPrimitive.Root>
      {!editing && !running && <MessageActions user={user} />}
    </MessagePrimitive.Root>
  );
}

/** A group's mission status under the header; nothing for one-to-one chats. */
function GroupMissionBanner() {
  const chat = useCurrentChat();
  return chat?.kind === "group" ? <MissionBanner chatId={chat.id} /> : null;
}

/** Who is speaking in a group reply, above their part of it. */
function SpeakerLabel({ state }: { state: WorkflowCard }) {
  const colors = useChatColors();
  if (!state.speaker) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 2 }}>
      <MateAvatar gradient={state.speaker.gradient} shape={state.speaker.shape} size={24} still />
      <Text style={{ color: colors.foreground, fontFamily: "DMSans_600SemiBold", fontSize: 14 }}>{state.speaker.name}</Text>
    </View>
  );
}

function EmptyChat({ keyboardVisible }: { keyboardVisible: boolean }) {
  const colors = useChatColors();
  const chat = useCurrentChat();
  const reducedMotion = useReducedMotion();
  const [activeSpot, setActiveSpot] = useState(0);
  const accent = glowColorForChat(chat);
  const compact = keyboardVisible;
  const avatarSize = compact ? 80 : EMPTY_CHAT_AVATAR_SIZE;
  const screenRef = useRef<View>(null);
  const screenTapX = useSharedValue(-EMPTY_SCREEN_TAP_GLOW_SIZE / 2);
  const screenTapY = useSharedValue(-EMPTY_SCREEN_TAP_GLOW_SIZE / 2);
  const screenTapOpacity = useSharedValue(0);
  const screenTapScale = useSharedValue(0.7);

  const screenTapGlowMotion = useAnimatedStyle(() => ({
    opacity: screenTapOpacity.value,
    transform: [
      { translateX: screenTapX.value },
      { translateY: screenTapY.value },
      { scale: screenTapScale.value },
    ],
  }));

  const showScreenTapGlow = (event: GestureResponderEvent) => {
    if (reducedMotion) return;
    const { pageX, pageY } = event.nativeEvent;
    screenRef.current?.measureInWindow((left, top) => {
      screenTapX.value = pageX - left - EMPTY_SCREEN_TAP_GLOW_SIZE / 2;
      screenTapY.value = pageY - top - EMPTY_SCREEN_TAP_GLOW_SIZE / 2;
      screenTapScale.value = 0.7;
      screenTapOpacity.value = withSequence(
        withTiming(0.38, { duration: 100 }),
        withDelay(160, withTiming(0, { duration: 390 })),
      );
      screenTapScale.value = withTiming(1, {
        duration: 520,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      });
    });
  };

  useEffect(() => {
    setActiveSpot(0);
  }, [chat?.id]);

  useEffect(() => {
    if (keyboardVisible || reducedMotion) return;
    const timer = setInterval(() => {
      setActiveSpot((index) => (index + 1) % suggestionSpots.length);
      Haptics.selectionAsync().catch(() => {});
    }, EMPTY_SUGGESTION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [chat?.id, keyboardVisible, reducedMotion]);

  const title =
    chat?.kind === "mate" && chat.mate && chat.mate.name !== "Cooper"
      ? `Hi, I'm ${chat.mate.name}. How can I help?`
      : chat?.kind === "group"
        ? `${chat.title}: ask anyone, or @mention a mate`
        : "How can I help you today?";

  return (
    <View ref={screenRef} style={{ flex: 1 }} onTouchStart={showScreenTapGlow}>
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}
      >
        <Glow
          color={accent}
          size={520}
          opacity={0.32}
          style={{
            left: "50%",
            top: "50%",
            transform: [{ translateX: -260 }, { translateY: -260 }],
          }}
        />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: compact ? "flex-end" : "center",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: compact ? 12 : 28,
        }}
        keyboardShouldPersistTaps="handled"
      >
      <View style={{ width: "100%", maxWidth: EMPTY_CHAT_WIDTH, gap: compact ? 12 : 16 }}>
        {!compact ? (
          <View style={{ alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: avatarSize,
                height: avatarSize,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {chat?.kind === "group" ? (
                <GroupAvatar
                  gradients={chat.members.map((m) => m.gradient)}
                  shapes={chat.members.map((m) => m.shape)}
                  size={avatarSize}
                />
              ) : (
                <EmptyChatAvatar gradient={chat?.mate?.gradient} shape={chat?.mate?.shape} />
              )}
            </View>
            <Text
              accessibilityRole="header"
              style={{
                color: colors.foreground,
                fontSize: 26,
                fontFamily: "DMSans_600SemiBold",
                letterSpacing: -0.5,
                textAlign: "center",
                maxWidth: 300,
              }}
            >
              {title}
            </Text>
          </View>
        ) : (
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {chat?.kind === "group" ? (
              <GroupAvatar
                gradients={chat.members.map((m) => m.gradient)}
                shapes={chat.members.map((m) => m.shape)}
                size={32}
              />
            ) : (
              <MateAvatar gradient={chat?.mate?.gradient} shape={chat?.mate?.shape} size={32} />
            )}
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              style={{
                flexShrink: 1,
                color: colors.foreground,
                fontSize: 20,
                fontFamily: "DMSans_600SemiBold",
                letterSpacing: -0.4,
                textAlign: "left",
                maxWidth: 300,
              }}
            >
              {title}
            </Text>
          </View>
        )}

        {!compact && (
          <View style={{ minHeight: EMPTY_PROMPT_BLOCK_HEIGHT, justifyContent: "center" }}>
            <EmptyChatRotatingPrompt
              key={chat?.id ?? "chat"}
              index={activeSpot}
              colors={colors}
              accent={accent}
              reducedMotion={!!reducedMotion}
            />
          </View>
        )}
      </View>
      </ScrollView>
      <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[
            {
              position: "absolute",
              width: EMPTY_SCREEN_TAP_GLOW_SIZE,
              height: EMPTY_SCREEN_TAP_GLOW_SIZE,
            },
            screenTapGlowMotion,
          ]}
        >
          <Glow color={accent} size={EMPTY_SCREEN_TAP_GLOW_SIZE} opacity={0.6} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** Placeholder bubbles while a chat's messages load, so loading never looks like an empty chat. */
function MessagesLoading() {
  const colors = useChatColors();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const bubble = (width: `${number}%`, mine: boolean, height = 18) => (
    <View style={{ alignSelf: mine ? "flex-end" : "flex-start", width, height, borderRadius: 9, backgroundColor: colors.muted }} />
  );
  return (
    <Animated.View accessibilityLabel="Loading messages" style={[{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 20, paddingBottom: 24, gap: 10 }, style]}>
      {bubble("46%", true, 36)}
      {bubble("82%", false)}
      {bubble("74%", false)}
      {bubble("52%", false)}
      <View style={{ height: 14 }} />
      {bubble("38%", true, 36)}
      {bubble("78%", false)}
      {bubble("60%", false)}
    </Animated.View>
  );
}

function ChatBody({ keyboardVisible, loading }: { keyboardVisible: boolean; loading: boolean }) {
  const isEmpty = useAuiState((state) => state.thread.isEmpty);
  const isLoading = useAuiState((state) => state.thread.isLoading);
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {isEmpty && (loading || isLoading) ? (
        <MessagesLoading />
      ) : isEmpty ? (
        <EmptyChat keyboardVisible={keyboardVisible} />
      ) : (
        <ThreadPrimitive.MessagesFlatList
          autoScroll
          style={{ flex: 1 }}
          contentContainerStyle={{
            width: "100%",
            maxWidth: 768,
            alignSelf: "center",
            paddingHorizontal: 12,
            paddingTop: 20,
            paddingBottom: 20,
            gap: 18,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {() => <ChatMessage />}
        </ThreadPrimitive.MessagesFlatList>
      )}
    </View>
  );
}

function SendControl({
  canSend,
  onSend,
}: {
  canSend: boolean;
  onSend: () => void;
}) {
  const colors = useChatColors();
  return (
    <Pressable
      accessibilityLabel="Send message"
      accessibilityRole="button"
      accessibilityState={{ disabled: !canSend }}
      disabled={!canSend}
      onPress={onSend}
      style={{
        width: 38,
        height: 38,
        borderRadius: 999,
        backgroundColor: canSend ? colors.primary : colors.muted,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ChatIcon
        name="send"
        color={canSend ? colors.primaryForeground : colors.mutedForeground}
        size={18}
      />
    </Pressable>
  );
}

function ComposerSurface({
  glass,
  children,
}: {
  glass: boolean;
  children: React.ReactNode;
}) {
  const colors = useChatColors();
  const style = {
    borderRadius: 28,
    borderCurve: "continuous" as const,
    backgroundColor: glass ? "transparent" : colors.composer,
  };
  return glass ? (
    <GlassView glassEffectStyle="regular" colorScheme="auto" style={style}>
      {children}
    </GlassView>
  ) : (
    <View style={style}>{children}</View>
  );
}

function ChatComposer() {
  const aui = useAui();
  const { getToken } = useAuth();
  const appsQuery = useConnectedMentionApps();
  const currentChat = useCurrentChat();
  const currentMateName =
    currentChat?.kind === "mate"
      ? currentChat.mate?.name ?? currentChat.title
      : currentChat?.kind === "group"
        ? currentChat.title
        : "Cooper";
  const composerText = useAuiState((state) => state.composer.text);
  const canSend = useAuiState((state) => state.thread.composer.canSend);
  const [selectedApp, setSelectedApp] = useState<AppConnection | null>(null);
  // Picked from the @ menu: the next message always searches the web (sent as "@Web").
  const [searchOn, setSearchOn] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const attachments = useAuiState((state) => state.composer.attachments);
  // Picked files still uploading; they join the composer's attachments once the server has them.
  const [uploads, setUploads] = useState<{ key: string; uri?: string; name: string; image: boolean }[]>([]);
  const slots = MAX_ATTACHMENTS - attachments.length - uploads.length;
  const [voiceStatus, setVoiceStatus] = useState<"listening" | "transcribing">("listening");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0.3);
  const voiceSessionRef = useRef<VoiceTranscriptionSession | null>(null);
  const originalTextRef = useRef("");

  const handleSelectPlusOption = (option: PlusMenuOption) => {
    setIsPlusMenuOpen(false);
    const prev = composerText.trim();
    if (option === "camera") {
      setIsCameraOpen(true);
    } else if (option === "photos") {
      void pickPhotos();
    } else if (option === "files") {
      void pickDocuments();
    }
  };

  /** Uploads as soon as something is picked, so pressing send never waits on the network. */
  const attach = async (prepare: () => Promise<UploadSource>, item: { uri?: string; name: string; image: boolean }) => {
    const key = `${Date.now()}-${Math.random()}`;
    setUploads((current) => [...current, { key, ...item }]);
    try {
      const uploaded = await uploadAttachment(await prepare(), getToken);
      await aui.composer.addAttachment({
        id: uploaded.id,
        name: uploaded.name,
        type: uploaded.contentType.startsWith("image/") ? "image" : "document",
        contentType: uploaded.contentType,
        content: [{ type: "text", text: `[Attached ${uploaded.name}]` }],
      });
    } catch (cause) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => { });
      Alert.alert("Couldn’t attach", cause instanceof Error ? cause.message : "Try again.");
    } finally {
      setUploads((current) => current.filter((upload) => upload.key !== key));
    }
  };

  const limitReached = () => {
    Alert.alert("Attachment limit", `You can attach up to ${MAX_ATTACHMENTS} files to a message.`);
  };

  const attachPhotos = (uris: string[]) => {
    if (slots <= 0) return limitReached();
    for (const uri of uris.slice(0, slots)) void attach(() => prepareImage(uri), { uri, name: "Photo", image: true });
  };

  // The system photo picker, as in Finora: runs out of process and needs no library permission.
  const pickPhotos = async () => {
    if (slots <= 0) return limitReached();
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: slots,
        quality: 1, // Re-encoded once in prepareImage.
      });
      if (!result.canceled) attachPhotos(result.assets.map((asset) => asset.uri));
    } catch {
      Alert.alert("Couldn’t open photos", "Try again.");
    }
  };

  const pickDocuments = async () => {
    if (slots <= 0) return limitReached();
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_TYPES, multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      for (const asset of result.assets.slice(0, slots)) {
        void attach(
          async () => ({ uri: asset.uri, name: asset.name, contentType: asset.mimeType ?? "application/octet-stream", size: asset.size }),
          { name: asset.name, image: false },
        );
      }
    } catch {
      Alert.alert("Couldn’t open files", "Try again.");
    }
  };

  const handleCameraCapture = (photo: { uri: string }) => attachPhotos([photo.uri]);

  // Phones record and transcribe through the API (Deepgram); the web build keeps Web Speech.
  const nativeVoice = Platform.OS !== "web";
  const stopVoiceRef = useRef<() => void>(() => {});
  const dictation = useDictation({ onLevel: setAudioLevel, onAutoStop: () => stopVoiceRef.current() });
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;
  /** Ends the current recording and returns what was said. */
  const finishVoice = async () => {
    if (nativeVoice) return dictation.stop();
    const session = voiceSessionRef.current;
    voiceSessionRef.current = null;
    return session ? (await session.stop()) || liveTranscript : liveTranscript;
  };

  useEffect(() => {
    return () => {
      if (voiceSessionRef.current) {
        voiceSessionRef.current.cancel();
        voiceSessionRef.current = null;
      }
      void dictationRef.current.cancel();
    };
  }, []);

  const startVoice = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    originalTextRef.current = composerText;
    setLiveTranscript("");
    setAudioLevel(0.25);
    setVoiceStatus("listening");
    setIsVoiceActive(true);

    if (nativeVoice) {
      if (!(await dictation.start())) setIsVoiceActive(false);
      return;
    }
    const session = startVoiceTranscription({
      onInterim: (text) => {
        setLiveTranscript(text);
      },
      onAudioLevel: (level) => {
        setAudioLevel(level);
      },
      onError: (err) => {
        console.warn("Voice dictation error:", err);
      },
    });
    voiceSessionRef.current = session;
  };

  const stopVoice = async () => {
    setVoiceStatus("transcribing");
    const finalSpeech = await finishVoice();

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { }

    setIsVoiceActive(false);
    setVoiceStatus("listening");

    const spokenText = finalSpeech.trim();
    if (spokenText) {
      const prev = originalTextRef.current.trim();
      const updated = prev ? `${prev} ${spokenText}` : spokenText;
      aui.composer.setText(updated);
    }
    setLiveTranscript("");
  };

  stopVoiceRef.current = () => void stopVoice();

  const sendVoice = async () => {
    setVoiceStatus("transcribing");
    const finalSpeech = await finishVoice();

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { }

    setIsVoiceActive(false);
    setVoiceStatus("listening");

    const spokenText = finalSpeech.trim();
    if (spokenText) {
      const prev = originalTextRef.current.trim();
      const updated = prev ? `${prev} ${spokenText}` : spokenText;
      aui.composer.setText(updated);
      setTimeout(() => {
        aui.composer.send();
      }, 50);
    }
    setLiveTranscript("");
  };

  const cancelVoice = () => {
    if (voiceSessionRef.current) {
      voiceSessionRef.current.cancel();
      voiceSessionRef.current = null;
    }
    if (nativeVoice) void dictation.cancel();
    setIsVoiceActive(false);
    setVoiceStatus("listening");
    setLiveTranscript("");
  };

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (mounted) setReduceTransparency(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const useGlass =
    Platform.OS === "ios" &&
    !reduceTransparency &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable();
  const sendMessage = () => {
    if (!canSend || uploads.length) return;
    const tags = [selectedApp ? `@${selectedApp.name}` : null, searchOn ? "@Web" : null].filter(Boolean).join(" ");
    if (tags) {
      const text = composerText.trimEnd();
      aui.composer.setText(`${text}${text ? " " : ""}${tags}`);
    }
    aui.composer.send();
    setSelectedApp(null);
    setSearchOn(false);
  };
  const mentionMatch = composerText.match(/(?:^|\s)@([^\s@]*)$/);
  const mentionQuery = mentionMatch?.[1]?.toLowerCase() ?? "";
  // In a group, @ first offers its mates; picking one tags them so they answer.
  const mentionMates = (currentChat?.kind === "group" ? currentChat.members : []).filter((mate) => mate.name.toLowerCase().includes(mentionQuery)).slice(0, 6);
  const mentionApps = (appsQuery.data ?? []).filter((app) =>
    `${app.name} ${app.slug}`.toLowerCase().includes(mentionQuery),
  ).slice(0, 6);
  // "Web search" leads the @ menu while the typed word could still be it.
  const mentionWeb = !searchOn && ("web search".includes(mentionQuery) || "search".startsWith(mentionQuery));
  const [stopError, setStopError] = useState<string | null>(null);
  const colors = useChatColors();
  return (
    <View style={{ width: "100%", maxWidth: 792, alignSelf: "center" }}>
      {mentionMatch && (mentionWeb || appsQuery.data || mentionMates.length > 0) && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 72,
            zIndex: 20,
            maxHeight: 300,
            padding: 8,
            borderRadius: 20,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            backgroundColor: colors.background,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
          }}
        >
          {mentionWeb || mentionApps.length || mentionMates.length ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 284 }}
            >
              {mentionWeb && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Search the web"
                  onPress={() => {
                    const at = composerText.lastIndexOf("@");
                    const prefix = composerText.slice(0, at).trimEnd();
                    aui.composer.setText(prefix ? `${prefix} ` : "");
                    setSearchOn(true);
                  }}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 10,
                    borderRadius: 14,
                    backgroundColor: pressed ? colors.muted : "transparent",
                  })}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted }}>
                    <ChatIcon name="globe" color={colors.foreground} size={19} />
                  </View>
                  <View>
                    <Text style={{ color: colors.foreground, fontFamily: "DMSans_500Medium", fontSize: 15 }}>Web search</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Look it up on the web</Text>
                  </View>
                </Pressable>
              )}
              {mentionMates.map((mate) => (
                <Pressable
                  key={mate.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ask ${mate.name}`}
                  onPress={() => {
                    const at = composerText.lastIndexOf("@");
                    aui.composer.setText(`${composerText.slice(0, at)}@${mate.name} `);
                  }}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 10,
                    borderRadius: 14,
                    backgroundColor: pressed ? colors.muted : "transparent",
                  })}
                >
                  <MateAvatar gradient={mate.gradient} shape={mate.shape} size={34} still />
                  <Text style={{ color: colors.foreground, fontFamily: "DMSans_500Medium", fontSize: 15 }}>{mate.name}</Text>
                </Pressable>
              ))}
              {mentionApps.map((app) => (
                <Pressable
                  key={app.slug}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${app.name}`}
                  onPress={() => {
                    const at = composerText.lastIndexOf("@");
                    const prefix = composerText.slice(0, at).trimEnd();
                    aui.composer.setText(prefix ? `${prefix} ` : "");
                    setSelectedApp(app);
                  }}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 10,
                    borderRadius: 14,
                    backgroundColor: pressed ? colors.muted : "transparent",
                  })}
                >
                  <AppLogo name={app.name} logo={app.logo} size={34} />
                  <Text style={{ color: colors.foreground, fontFamily: "DMSans_500Medium", fontSize: 15 }}>
                    {app.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={{ padding: 12, color: colors.mutedForeground, fontSize: 14 }}>
              No mates or connected apps match “{mentionMatch[1]}”.
            </Text>
          )}
        </View>
      )}
      <ComposerCameraSheet
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
        colors={colors}
      />
      <ComposerPlusMenu
        isOpen={isPlusMenuOpen}
        useGlass={useGlass}
        colors={colors}
        onSelect={handleSelectPlusOption}
        onClose={() => setIsPlusMenuOpen(false)}
      />
      <ComposerSurface glass={useGlass}>
        {isVoiceActive ? (
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              minHeight: 52,
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderRadius: 28,
              borderCurve: "continuous",
              borderWidth: useGlass ? 0 : 1,
              borderColor: colors.border,
              backgroundColor: "transparent",
            }}
          >
            <VoiceDictationBar
              status={voiceStatus}
              transcript={liveTranscript}
              audioLevel={audioLevel}
              colors={colors}
              onStop={stopVoice}
              onSend={sendVoice}
              onCancel={cancelVoice}
            />
          </View>
        ) : (
          <ComposerPrimitive.Root
            style={{
              width: "100%",
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 28,
              borderCurve: "continuous",
              borderWidth: useGlass ? 0 : 1,
              borderColor: colors.border,
              backgroundColor: "transparent",
            }}
          >
            {/* Attachments get their own strip so the input row keeps its full width. */}
            {(attachments.length > 0 || uploads.length > 0) && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 4, paddingHorizontal: 2 }}
              >
                {attachments.map((attachment) => (
                  <ComposerAttachmentChip
                    key={attachment.id}
                    id={attachment.id}
                    name={attachment.name}
                    image={attachment.type === "image"}
                    colors={colors}
                    onRemove={() => void aui.composer.attachment({ id: attachment.id }).remove()}
                  />
                ))}
                {uploads.map((upload) => (
                  <ComposerAttachmentChip key={upload.key} uri={upload.uri} name={upload.name} image={upload.image} uploading colors={colors} />
                ))}
              </ScrollView>
            )}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
              <Pressable
                accessibilityLabel={isPlusMenuOpen ? "Close options" : "More options"}
                accessibilityRole="button"
                hitSlop={6}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
                  setIsPlusMenuOpen((prev) => !prev);
                }}
                style={({ pressed }) => ({
                  width: 38,
                  height: 38,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 19,
                  opacity: pressed ? 0.7 : 1,
                  transform: [
                    { scale: pressed ? 0.94 : 1 },
                    { rotate: isPlusMenuOpen ? "45deg" : "0deg" },
                  ],
                })}
              >
                <ChatIcon name="add" color={colors.foreground} size={23} />
              </Pressable>
              {selectedApp && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingLeft: 2,
                    paddingRight: 8,
                    paddingVertical: 4,
                    borderRadius: 18,
                    backgroundColor: "transparent",
                  }}
                >
                  <AppLogo name={selectedApp.name} logo={selectedApp.logo} size={28} />
                  <Text
                    numberOfLines={1}
                    style={{
                      maxWidth: 90,
                      color: colors.foreground,
                      fontFamily: "DMSans_500Medium",
                      fontSize: 13,
                    }}
                  >
                    {selectedApp.name}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${selectedApp.name}`}
                    hitSlop={6}
                    onPress={() => setSelectedApp(null)}
                  >
                    <Text style={{ color: colors.mutedForeground, fontSize: 18, lineHeight: 20 }}>×</Text>
                  </Pressable>
                </View>
              )}
              {searchOn && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingLeft: 8, paddingRight: 8, paddingVertical: 5, borderRadius: 16, backgroundColor: colors.muted }}>
                  <ChatIcon name="globe" color={colors.foreground} size={15} />
                  <Text style={{ color: colors.foreground, fontFamily: "DMSans_500Medium", fontSize: 13 }}>Search</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Turn off web search" hitSlop={6} onPress={() => setSearchOn(false)}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 18, lineHeight: 20 }}>×</Text>
                  </Pressable>
                </View>
              )}
              {/* Grows with its content between min and max height; no height state per keystroke. */}
              <ComposerTextInput
                maxLength={8000}
                multiline
                blurOnSubmit={false}
                onSubmitWeb={sendMessage}
                placeholder={selectedApp ? "" : searchOn ? "Search the web…" : `Ask ${currentMateName}…`}
                placeholderTextColor={colors.mutedForeground}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 42,
                  maxHeight: 132,
                  paddingHorizontal: 4,
                  paddingVertical: 8,
                  color: colors.foreground,
                  fontFamily: "DMSans_400Regular",
                  fontSize: 17,
                  lineHeight: 22,
                  textAlignVertical: "center",
                }}
              />
              <Pressable
                accessibilityLabel="Voice dictation"
                accessibilityRole="button"
                hitSlop={8}
                onPress={startVoice}
                style={({ pressed }) => ({
                  width: 38,
                  height: 38,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 19,
                  opacity: pressed ? 0.7 : 1,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                })}
              >
                <ChatIcon name="mic" color={colors.foreground} size={21} />
              </Pressable>
              <AuiIf condition={(state) => !state.thread.isRunning}>
                <SendControl canSend={canSend && !uploads.length} onSend={sendMessage} />
              </AuiIf>
              <AuiIf condition={(state) => state.thread.isRunning}>
                <Pressable
                  accessibilityLabel="Stop response"
                  accessibilityRole="button"
                  onPress={async () => {
                    try {
                      const id = aui.threadListItem.getState().remoteId;
                      if (id) await cancelBackgroundChat(getToken, id);
                      aui.thread.cancelRun();
                      setStopError(null);
                    } catch { setStopError("Couldn’t stop the task. Reconnect and try again."); }
                  }}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    backgroundColor: colors.foreground,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ChatIcon name="stop" color={colors.background} size={15} />
                </Pressable>
              </AuiIf>
            </View>
            {stopError && <Text style={{ color: colors.destructive, fontSize: 12 }}>{stopError}</Text>}
          </ComposerPrimitive.Root>
        )}
      </ComposerSurface>
    </View>
  );
}

function ChatDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const colors = useChatColors();
  const aui = useAui();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const menuItems = [
    { label: "Feed", icon: "feed", href: "/feed" },
    { label: "Ideas", icon: "ideas", href: "/ideas" },
    { label: "Tasks", icon: "tasks", href: "/tasks" },
    { label: "Apps", icon: "connections", href: "/connections" },
  ] as const;

  // Closing by swipe skips close(), so search resets whenever the drawer shuts.
  useEffect(() => {
    if (open) return;
    setSearching(false);
    setQuery("");
  }, [open]);
  const close = () => onClose();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top + 10,
        paddingHorizontal: 24,
        paddingBottom: insets.bottom + 18,
      }}
    >
      <View
        style={{
          height: 54,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        {searching ? (
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search mates"
            placeholderTextColor={colors.mutedForeground}
            style={{
              flex: 1,
              color: colors.foreground,
              fontFamily: "DMSans_400Regular",
              fontSize: 18,
            }}
          />
        ) : (
          <Text
            style={{
              color: colors.foreground,
              fontFamily: "DMSans_700Bold",
              fontSize: 23,
              letterSpacing: -0.5,
            }}
          >
            Mate
          </Text>
        )}
        <LiquidGlassButton
          accessibilityLabel={searching ? "Close search" : "Search mates"}
          size={46}
          onPress={() => {
            if (searching) {
              setSearching(false);
              setQuery("");
            } else setSearching(true);
          }}
        >
          <ChatIcon name={searching ? "close" : "search"} color={colors.foreground} size={searching ? 20 : 24} />
        </LiquidGlassButton>
      </View>

      <View style={{ gap: 2, paddingTop: 4, paddingBottom: 22 }}>
        {menuItems.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            onPress={() => {
              close();
              router.push(item.href);
            }}
            style={({ pressed }) => ({
              minHeight: 58,
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              borderRadius: 15,
              backgroundColor: pressed ? colors.muted : "transparent",
            })}
          >
            <ChatIcon
              name={item.icon}
              color={colors.foreground}
              size={24}
            />
            <Text
              style={{
                color: colors.foreground,
                fontFamily: "DMSans_600SemiBold",
                fontSize: 18,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* A heading, not a rule, separates the sections, as in ChatGPT's menu. */}
      <Text
        accessibilityRole="header"
        style={{
          color: colors.foreground,
          fontFamily: "DMSans_600SemiBold",
          fontSize: 16,
          marginTop: 10,
          marginBottom: 8,
        }}
      >
        Mates
      </Text>
      <MatesList open={open} query={query} colors={colors} onSelect={close} />

      {/* Grouped so their Liquid Glass merges on iOS 26, as in the chat header. */}
      <GlassContainer
        spacing={12}
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 16,
        }}
      >
        <LiquidGlassButton
          accessibilityLabel="New mate or group"
          size={48}
          tintColor={colors.foreground}
          style={{ width: 132 }}
          onPress={() => {
            close();
            router.push("/new-mate");
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ChatIcon name="addUser" color={colors.background} size={21} />
            <Text
              style={{
                color: colors.background,
                fontFamily: "DMSans_600SemiBold",
                fontSize: 17,
              }}
            >
              New
            </Text>
          </View>
        </LiquidGlassButton>
        <LiquidGlassButton
          accessibilityLabel="Settings"
          size={48}
          onPress={() => {
            close();
            router.push("/settings");
          }}
        >
          <ChatIcon name="settings" color={colors.foreground} size={24} />
        </LiquidGlassButton>
      </GlassContainer>
    </View>
  );
}

/** The open chat's mate (or group), tappable to edit them. */
function ChatTitle() {
  const colors = useChatColors();
  const router = useRouter();
  const chat = useCurrentChat();
  const name = chat ? (chat.kind === "mate" ? chat.mate?.name ?? chat.title : chat.kind === "group" ? chat.title : "Cooper") : "Cooper";
  const profile =
    chat?.kind === "mate" && chat.mate ? `/mate/${chat.mate.id}` : chat?.kind === "group" ? `/group/${chat.id}` : null;
  return (
    <Pressable
      accessibilityRole={profile ? "button" : "header"}
      accessibilityLabel={profile ? `${name}, view profile` : name}
      disabled={!profile}
      onPress={() => profile && router.push(profile as never)}
      hitSlop={6}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, maxWidth: 220, opacity: pressed ? 0.7 : 1 })}
    >
      {chat?.kind === "group" ? (
        <GroupAvatar gradients={chat.members.map((m) => m.gradient)} shapes={chat.members.map((m) => m.shape)} size={30} />
      ) : (
        <MateAvatar gradient={chat?.mate?.gradient} shape={chat?.mate?.shape} size={30} />
      )}
      <View style={{ flexShrink: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: "DMSans_600SemiBold", fontSize: 17 }}>{name}</Text>
        {chat?.kind === "group" && <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{chat.members.length} mates</Text>}
      </View>
    </Pressable>
  );
}

function ChatHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const colors = useChatColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <>
      <View
        style={{
          height: insets.top + 64,
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.background,
        }}
      >
        <LiquidGlassButton
          accessibilityLabel="Open menu"
          onPress={onOpenMenu}
        >
          <ChatIcon name="menu" color={colors.foreground} size={24} />
        </LiquidGlassButton>
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: insets.top + 8,
            height: 40,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChatTitle />
        </View>
        <GlassContainer
          spacing={8}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <LiquidGlassButton
            accessibilityLabel="Call"
            onPress={() => router.push("/call" as any)}
          >
            <ChatIcon name="call" color={colors.foreground} size={24} />
          </LiquidGlassButton>
        </GlassContainer>
      </View>
    </>
  );
}

/**
 * The chat slides aside at full size like a card, as in ChatGPT: its corners round to match the
 * phone's own screen corners as the drawer opens, with a soft shadow where it meets the menu.
 * Driven by drawer progress, so it tracks the finger frame by frame on the UI thread.
 */
function DrawerPushedContent({ children }: { children: React.ReactNode }) {
  const colors = useChatColors();
  const { isDark } = useTheme();
  const progress = useDrawerProgress();
  const insets = useSafeAreaInsets();
  // React Native can't read the display's corner radius: Face ID iPhones are ~44pt, Home-button
  // iPhones are square, and Android varies, so it gets a neutral radius.
  const corner = Platform.OS === "ios" ? (insets.bottom > 0 ? 44 : 0) : 24;
  const rounded = useAnimatedStyle(() => ({ borderRadius: interpolate(progress.get(), [0, 1], [0, corner]) }));
  return (
    // The shadow lives on an outer layer: the inner one clips to the corners and would cut it off.
    // A wide soft haze plus a tight edge, as ChatGPT's card casts onto its menu; stronger in dark
    // mode, where a light shadow would vanish.
    <Animated.View
      style={[
        {
          flex: 1,
          borderCurve: "continuous",
          backgroundColor: colors.background,
          boxShadow: isDark
            ? "-16px 0 48px rgba(0,0,0,0.6), -1px 0 4px rgba(0,0,0,0.4)"
            : "-16px 0 48px rgba(0,0,0,0.14), -1px 0 6px rgba(0,0,0,0.06)",
        },
        rounded,
      ]}
    >
      <Animated.View style={[{ flex: 1, overflow: "hidden", borderCurve: "continuous" }, rounded]}>{children}</Animated.View>
    </Animated.View>
  );
}

/** Keeps the open chat a real mate conversation: the last one opened, else Cooper. */
const LAST_CHAT = "last-chat";

/**
 * Opens the chat to resume at launch: the last one open, else the lead mate's. Both come from the
 * device cache, so the chat opens on the first frame; the server lists confirm it afterwards.
 * Returns true until that chat is open (or there's none to open), for the loading state.
 */
function useStartingChat() {
  const aui = useAui();
  const router = useRouter();
  const { notificationChatId } = useLocalSearchParams<{ notificationChatId?: string }>();
  const remoteId = useAuiState((state) => state.threadListItem.remoteId);
  const threadId = useAuiState((state) => state.threadListItem.id);
  const firstThreadId = useRef(threadId);
  const openedAtLaunch = useRef<string | null>(null);
  const chats = useChats();
  const mates = useMates();
  const [starting, setStarting] = useState(true);
  const leaderChat = mates.data?.mates.find((mate) => mate.isDefault)?.chatId;
  // Typed as void, but it returns the switch task; failures must be caught either way.
  const open = useCallback((id: string) => Promise.resolve(aui.threads.switchToThread(id)), [aui]);

  useEffect(() => {
    if (remoteId) writeCache(LAST_CHAT, remoteId);
  }, [remoteId]);

  useEffect(() => {
    if (!notificationChatId || !chats.data?.some((chat) => chat.id === notificationChatId)) return;
    let cancelled = false;
    void (async () => {
      try {
        if (remoteId !== notificationChatId) await aui.threads.switchToThread(notificationChatId);
        if (!cancelled) router.setParams({ notificationChatId: undefined });
      } catch {
        if (!cancelled) Alert.alert("Couldn’t open chat", "Tap the notification again to retry.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aui, chats.data, notificationChatId, remoteId, router]);

  useEffect(() => {
    if (!starting || notificationChatId) return;
    // A chat is open, or the user started a new one before launch finished: nothing to resume.
    if (remoteId || threadId !== firstThreadId.current) return setStarting(false);
    const last = readCache<string>(LAST_CHAT)?.data;
    const target = last && (!chats.data || chats.data.some((chat) => chat.id === last)) ? last : leaderChat;
    if (!target) {
      if (mates.data || mates.isError) setStarting(false);
      return;
    }
    let cancelled = false;
    openedAtLaunch.current = target;
    open(target)
      .catch(() => {
        // The saved chat is gone; the lead mate's chat always exists.
        if (!cancelled && leaderChat && target !== leaderChat) return open(leaderChat);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setStarting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chats.data, leaderChat, mates.data, mates.isError, notificationChatId, open, remoteId, starting, threadId]);

  // Once the server has answered, leave a resumed chat that was deleted on another device.
  useEffect(() => {
    const resumed = openedAtLaunch.current;
    if (!resumed || remoteId !== resumed || !chats.isFetchedAfterMount || !chats.data) return;
    openedAtLaunch.current = null;
    if (!chats.data.some((chat) => chat.id === resumed) && leaderChat && leaderChat !== resumed) void open(leaderChat).catch(() => undefined);
  }, [chats.data, chats.isFetchedAfterMount, leaderChat, open, remoteId]);

  return starting;
}

export function ChatThread() {
  const colors = useChatColors();
  const { isDark } = useTheme();
  const starting = useStartingChat();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <Drawer
      open={drawerOpen}
      onOpen={() => {
        Haptics.selectionAsync().catch(() => { });
        setDrawerOpen(true);
      }}
      onClose={() => setDrawerOpen(false)}
      // "back": the menu stays still underneath and the chat card slides over it, so the card's
      // shadow falls on the menu. With "slide" the menu is drawn on top and hides that shadow.
      drawerType="back"
      drawerStyle={{ width: Math.min(width * 0.82, 380), backgroundColor: colors.background }}
      // No dimming in light mode, so the chat stays bright as in ChatGPT; the overlay still takes
      // the tap that closes the drawer. Dark mode keeps a faint dim so the edge isn't harsh.
      overlayStyle={{ backgroundColor: isDark ? "rgba(0,0,0,0.12)" : "transparent" }}
      // Open from anywhere on the left side, not only the edge; a short drag is still a scroll.
      swipeEdgeWidth={width * 0.4}
      swipeMinDistance={24}
      renderDrawerContent={() => <ChatDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />}
    >
      <DrawerPushedContent>
        <ChatScreen starting={starting} onOpenMenu={() => setDrawerOpen(true)} />
      </DrawerPushedContent>
    </Drawer>
  );
}

function ChatScreen({ starting, onOpenMenu }: { starting: boolean; onOpenMenu: () => void }) {
  const colors = useChatColors();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <KeyboardAvoidingView
      testID="chat-screen"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ThreadPrimitive.Root style={{ flex: 1, minHeight: 0 }}>
        <ChatHeader onOpenMenu={onOpenMenu} />
        <GroupMissionBanner />
        <ChatSyncNotice />
        <ChatBody keyboardVisible={keyboardVisible} loading={starting} />
        <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
          <ChatComposer />
        </View>
        <View
          style={{
            height: keyboardVisible ? 8 : insets.bottom + 6,
          }}
        />
      </ThreadPrimitive.Root>
    </KeyboardAvoidingView>
  );
}
