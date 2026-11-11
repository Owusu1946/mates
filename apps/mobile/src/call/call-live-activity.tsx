import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";
import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityLabel, activityBackgroundTint, background, contentTransition, font,
  foregroundStyle, frame, lineLimit, monospacedDigit, multilineTextAlignment,
  padding, resizable, shapes,
} from "@expo/ui/swift-ui/modifiers";

export type CallActivityMate = {
  id: string;
  name: string;
  gradient: [string, string, string];
  shape?: string;
  avatarUri?: string;
  speakingAvatarUri?: string;
};

export type CallLiveActivityProps = {
  callId: string;
  leadId: string;
  mates: CallActivityMate[];
  speakerId: string | null;
  startedAtMs: number;
  isMuted: boolean;
  speakerOn: boolean;
  reconnecting: boolean;
  isDark: boolean;
};

function CallLiveActivityView(props: CallLiveActivityProps, environment: LiveActivityEnvironment) {
  "widget";

  // Keep this view self-contained: it runs in the widget's isolated JS runtime.
  const mates = props.mates.slice(0, 4);
  const lead = mates.find((mate) => mate.id === props.leadId) ?? mates[0];
  const speaker = props.reconnecting ? undefined : mates.find((mate) => mate.id === props.speakerId);
  const featured = speaker ?? lead;
  const dimmed = environment.isLuminanceReduced === true;
  const dark = props.isDark || dimmed;
  // Same warm neutrals as the in-app call screen. The Island always uses black.
  const ink = dark ? "#FAFAFA" : "#18181B";
  const secondary = dark ? "#A1A1AA" : "#71717A";
  const surface = dark ? "#111113" : "#F7F6F3";
  const accent = dark ? "#E5A36F" : "#B76531";
  const title = lead ? `${lead.name}${mates.length > 1 ? ` + ${mates.length - 1}` : ""}` : "Your call";
  const reconnecting = props.reconnecting || environment.isStale === true;
  const status = reconnecting ? "Reconnecting…" : props.isMuted ? "Mic muted" : speaker ? `${speaker.name} is speaking` : "Listening to you";
  const statusSymbol = reconnecting ? "arrow.trianglehead.2.clockwise.rotate.90" : props.isMuted ? "mic.slash.fill" : speaker ? "waveform" : "mic.fill";
  const timer = new Date(props.startedAtMs);

  const portrait = (mate: CallActivityMate | undefined, size: number, expressive = false) => {
    const uri = expressive && !dimmed && mate?.id === speaker?.id ? mate?.speakingAvatarUri ?? mate?.avatarUri : mate?.avatarUri;
    return uri ? (
      <Image uiImage={uri} modifiers={[
        resizable(), frame({ width: size, height: size }), contentTransition("opacity"),
        accessibilityLabel(mate?.name ?? "Mate"),
      ]} />
    ) : (
      <Image systemName="waveform" color="#E5A36F" size={size * 0.5}
        modifiers={[frame({ width: size, height: size }), accessibilityLabel("Voice call")]} />
    );
  };
  // SwiftUI timer text expands by default. EVERY surface gives it a bounded width.
  const clock = (size: number, color: string, width: number) => (
    <Text date={timer} dateStyle="timer" modifiers={[
      font({ size, weight: "semibold", design: "rounded" }), monospacedDigit(),
      foregroundStyle(color), multilineTextAlignment("trailing"),
      frame({ width, alignment: "trailing" }), contentTransition("numericText", { countsDown: false }),
    ]} />
  );
  const roster = (
    <HStack spacing={3} modifiers={[accessibilityLabel(mates.map((mate) => mate.name).join(", "))]}>
      {mates.map((mate) => <HStack key={mate.id}>{portrait(mate, 25)}</HStack>)}
    </HStack>
  );

  return {
    banner: (
      <VStack spacing={12} modifiers={[
        padding({ horizontal: 18, vertical: 16 }), activityBackgroundTint(surface),
      ]}>
        <HStack spacing={14}>
          {portrait(featured, 76, true)}
          <VStack alignment="leading" spacing={7}>
            <Text modifiers={[font({ size: 23, weight: "bold", design: "rounded" }), foregroundStyle(ink), lineLimit(1)]}>{title}</Text>
            <HStack spacing={6}>
              <Image systemName={statusSymbol} size={12} color={props.isMuted ? "#D16A57" : accent} />
              <Text modifiers={[font({ size: 13, weight: "medium" }), foregroundStyle(secondary), lineLimit(1), contentTransition("opacity")]}>{status}</Text>
            </HStack>
          </VStack>
          <Spacer minLength={0} />
        </HStack>
        <HStack spacing={8}>
          {roster}
          <Spacer minLength={4} />
          {clock(17, ink, 84)}
          <Image systemName="arrow.up.right" color={secondary} size={12} modifiers={[padding({ leading: 6 }), accessibilityLabel("Return to call")]} />
        </HStack>
      </VStack>
    ),
    bannerSmall: (
      <HStack spacing={8}>
        {portrait(featured, 32, true)}
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 13, weight: "semibold" }), lineLimit(1)]}>{title}</Text>
          <Text modifiers={[font({ size: 11 }), lineLimit(1)]}>{status}</Text>
        </VStack>
      </HStack>
    ),
    compactLeading: portrait(featured, 28, true),
    compactTrailing: props.isMuted || reconnecting ? (
      <Image systemName={statusSymbol} color={props.isMuted ? "#EE9C8C" : "#E5A36F"} size={15} modifiers={[frame({ width: 24, height: 24 })]} />
    ) : clock(12, "#E5A36F", 52),
    minimal: portrait(featured, 26, true),
    expandedLeading: (
      <Image systemName={statusSymbol} color={props.isMuted ? "#EE9C8C" : "#E5A36F"} size={14} modifiers={[padding({ leading: 7, top: 4 })]} />
    ),
    expandedTrailing: clock(15, "#E5A36F", 72),
    expandedBottom: (
      <VStack spacing={12} modifiers={[padding({ horizontal: 7, top: 6, bottom: 6 })]}>
        <HStack spacing={14}>
          {portrait(featured, 72, true)}
          <VStack alignment="leading" spacing={6}>
            <Text modifiers={[font({ size: 22, weight: "bold", design: "rounded" }), foregroundStyle("#FAFAFA"), lineLimit(1)]}>{title}</Text>
            <Text modifiers={[font({ size: 13, weight: "medium" }), foregroundStyle("#A1A1AA"), lineLimit(1), contentTransition("opacity")]}>{status}</Text>
          </VStack>
          <Spacer minLength={0} />
        </HStack>
        <HStack spacing={8}>
          {roster}
          <Spacer minLength={4} />
          <HStack spacing={6} modifiers={[
            padding({ horizontal: 12, vertical: 8 }), background("#27272A", shapes.capsule()),
          ]}>
            <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle("#FAFAFA")]}>Return to call</Text>
            <Image systemName="arrow.up.right" color="#E5A36F" size={10} />
          </HStack>
        </HStack>
      </VStack>
    ),
  };
}

export default createLiveActivity("MatesCallActivity", CallLiveActivityView);
