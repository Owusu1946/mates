import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";
import { HStack, Image, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  accessibilityLabel, activityBackgroundTint, background, contentTransition, font,
  foregroundStyle, frame, lineLimit, monospacedDigit, multilineTextAlignment,
  opacity, padding, resizable, shapes,
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

  const mates = props.mates.slice(0, 4);
  const lead = mates.find((mate) => mate.id === props.leadId) ?? mates[0];
  const speaker = props.reconnecting ? undefined : mates.find((mate) => mate.id === props.speakerId);
  const featured = speaker ?? lead;
  const dimmed = environment.isLuminanceReduced === true;
  const dark = props.isDark || dimmed;

  // ── Palette ──────────────────────────────────────────────────────────
  // Warm neutrals that match the in-app call screen, with refined tones.
  // Dynamic Island always renders against pure black.
  const ink       = dark ? "#FAFAFA" : "#18181B";
  const secondary = dark ? "#A1A1AA" : "#71717A";
  const subtle    = dark ? "#3F3F46" : "#D4D4D8";
  const surface   = dark ? "#111113" : "#F7F6F3";
  const accent    = "#E5A36F";
  const mutedRed  = "#EE9C8C";

  // ── Derived state ────────────────────────────────────────────────────
  const reconnecting = props.reconnecting || environment.isStale === true;
  const title = lead
    ? `${lead.name}${mates.length > 1 ? ` + ${mates.length - 1}` : ""}`
    : "Your call";
  const status = reconnecting
    ? "Reconnecting\u2026"
    : props.isMuted
      ? "Mic muted"
      : speaker
        ? `${speaker.name} is speaking`
        : "Listening to you";
  const statusSymbol = reconnecting
    ? "arrow.trianglehead.2.clockwise.rotate.90"
    : props.isMuted
      ? "mic.slash.fill"
      : speaker
        ? "waveform"
        : "mic.fill";
  const statusColor = reconnecting ? subtle : props.isMuted ? mutedRed : accent;
  const timer = new Date(props.startedAtMs);

  // ── Atoms ────────────────────────────────────────────────────────────

  /** Mate avatar — uses expressive (speaking) artwork when the mate is the active speaker. */
  const portrait = (mate: CallActivityMate | undefined, size: number, expressive = false) => {
    const uri = expressive && !dimmed && mate?.id === speaker?.id
      ? mate?.speakingAvatarUri ?? mate?.avatarUri
      : mate?.avatarUri;
    return uri ? (
      <Image uiImage={uri} modifiers={[
        resizable(), frame({ width: size, height: size }),
        contentTransition("opacity"),
        accessibilityLabel(mate?.name ?? "Mate"),
      ]} />
    ) : (
      <Image systemName="waveform" color={accent} size={size * 0.45}
        modifiers={[frame({ width: size, height: size }), accessibilityLabel("Voice call")]} />
    );
  };

  /** Hero portrait with a soft radial glow in the mate's gradient color. */
  const hero = (mate: CallActivityMate | undefined, size: number) => {
    const glow = mate?.gradient[1] ?? accent;
    return (
      <ZStack alignment="center">
        {/* Soft glow ring — hidden on Always-On display to conserve luminance */}
        {!dimmed && (
          <HStack modifiers={[
            frame({ width: size + 14, height: size + 14 }),
            background(glow, shapes.circle()),
            opacity(0.18),
          ]}>
            <Spacer minLength={0} />
          </HStack>
        )}
        {portrait(mate, size, true)}
      </ZStack>
    );
  };

  /** Live timer with numericText content transition. */
  const clock = (size: number, color: string, width: number) => (
    <Text date={timer} dateStyle="timer" modifiers={[
      font({ size, weight: "semibold", design: "rounded" }),
      monospacedDigit(),
      foregroundStyle(color),
      multilineTextAlignment("trailing"),
      frame({ width, alignment: "trailing" }),
      contentTransition("numericText", { countsDown: false }),
    ]} />
  );

  /** Status line: SF Symbol + descriptive text. */
  const statusLine = (iconSize: number, textSize: number, textColor: string) => (
    <HStack spacing={5}>
      <Image systemName={statusSymbol} size={iconSize} color={statusColor}
        modifiers={[contentTransition("opacity")]} />
      <Text modifiers={[
        font({ size: textSize, weight: "medium" }),
        foregroundStyle(textColor),
        lineLimit(1),
        contentTransition("opacity"),
      ]}>{status}</Text>
    </HStack>
  );

  /** Roster strip — small portraits of all mates on the call. */
  const roster = (size: number) => (
    <HStack spacing={3} modifiers={[accessibilityLabel(mates.map((m) => m.name).join(", "))]}>
      {mates.map((mate) => <HStack key={mate.id}>{portrait(mate, size)}</HStack>)}
    </HStack>
  );

  /** Accent-tinted "Return to call" pill. */
  const returnPill = (isDI: boolean) => (
    <HStack spacing={5} modifiers={[
      padding({ horizontal: 12, vertical: 7 }),
      background(isDI ? "#E5A36F26" : (dark ? "#E5A36F26" : "#E5A36F1F"), shapes.capsule()),
      accessibilityLabel("Return to call"),
    ]}>
      <Text modifiers={[
        font({ size: 12, weight: "semibold" }),
        foregroundStyle(accent),
      ]}>Return</Text>
      <Image systemName="arrow.up.right" color={accent} size={9} />
    </HStack>
  );

  // ── Surfaces ─────────────────────────────────────────────────────────

  return {
    // ┌────────────────────────────────────────────────────────────────┐
    // │ LOCK SCREEN BANNER                                            │
    // │                                                                │
    // │  ┌──────┐  Title + N              Timer                       │
    // │  │ hero │  🎵 Status                                          │
    // │  └──────┘                                                     │
    // │  ○ ○ ○ ○                    [ Return → ]                      │
    // └────────────────────────────────────────────────────────────────┘
    banner: (
      <VStack spacing={14} modifiers={[
        padding({ horizontal: 20, vertical: 18 }),
        activityBackgroundTint(surface),
      ]}>
        {/* Hero row */}
        <HStack spacing={16}>
          {hero(featured, 80)}
          <VStack alignment="leading" spacing={7}>
            <Text modifiers={[
              font({ size: 22, weight: "bold", design: "rounded" }),
              foregroundStyle(ink),
              lineLimit(1),
            ]}>{title}</Text>
            {statusLine(11, 13, secondary)}
          </VStack>
          <Spacer minLength={0} />
          {clock(20, accent, 82)}
        </HStack>

        {/* Footer */}
        <HStack spacing={8}>
          {roster(26)}
          <Spacer minLength={4} />
          {returnPill(false)}
        </HStack>
      </VStack>
    ),

    // Small banner — shown when another Live Activity takes priority on the Lock Screen.
    bannerSmall: (
      <HStack spacing={10}>
        {portrait(featured, 34, true)}
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[
            font({ size: 14, weight: "semibold", design: "rounded" }),
            foregroundStyle(ink),
            lineLimit(1),
          ]}>{title}</Text>
          <HStack spacing={4}>
            <Image systemName={statusSymbol} size={9} color={statusColor}
              modifiers={[contentTransition("opacity")]} />
            <Text modifiers={[
              font({ size: 11, weight: "medium" }),
              foregroundStyle(secondary),
              lineLimit(1),
              contentTransition("opacity"),
            ]}>{status}</Text>
          </HStack>
        </VStack>
        <Spacer minLength={0} />
        {clock(14, accent, 60)}
      </HStack>
    ),

    // ── Dynamic Island ─────────────────────────────────────────────
    // Compact: avatar on the left, timer on the right.
    compactLeading: portrait(featured, 28, true),

    compactTrailing: props.isMuted ? (
      <Image systemName="mic.slash.fill" color={mutedRed} size={14}
        modifiers={[frame({ width: 24, height: 24 }), contentTransition("opacity")]} />
    ) : reconnecting ? (
      <Image systemName="arrow.trianglehead.2.clockwise.rotate.90" color={subtle} size={13}
        modifiers={[frame({ width: 24, height: 24 }), contentTransition("opacity")]} />
    ) : clock(13, accent, 54),

    // Minimal: standalone avatar pill.
    minimal: portrait(featured, 26, true),

    // Expanded: long-press reveals full call details.
    expandedLeading: (
      <Image systemName={statusSymbol} color={statusColor} size={13}
        modifiers={[padding({ leading: 6, top: 4 }), contentTransition("opacity")]} />
    ),

    expandedTrailing: clock(15, accent, 72),

    // ┌────────────────────────────────────────────────────────────────┐
    // │  🎵 icon     Title             Timer                          │
    // │                                                                │
    // │  ┌──────┐  Name                                               │
    // │  │ hero │  🎵 Status                                          │
    // │  └──────┘                                                     │
    // │  ○ ○ ○ ○                    [ Return → ]                      │
    // └────────────────────────────────────────────────────────────────┘
    expandedBottom: (
      <VStack spacing={14} modifiers={[padding({ horizontal: 6, top: 8, bottom: 6 })]}>
        {/* Hero: avatar + title/status */}
        <HStack spacing={14}>
          {hero(featured, 72)}
          <VStack alignment="leading" spacing={6}>
            <Text modifiers={[
              font({ size: 21, weight: "bold", design: "rounded" }),
              foregroundStyle("#FAFAFA"),
              lineLimit(1),
            ]}>{title}</Text>
            <HStack spacing={5}>
              <Image systemName={statusSymbol} size={11} color={statusColor}
                modifiers={[contentTransition("opacity")]} />
              <Text modifiers={[
                font({ size: 13, weight: "medium" }),
                foregroundStyle("#A1A1AA"),
                lineLimit(1),
                contentTransition("opacity"),
              ]}>{status}</Text>
            </HStack>
          </VStack>
          <Spacer minLength={0} />
        </HStack>

        {/* Footer: roster + CTA */}
        <HStack spacing={8}>
          {roster(24)}
          <Spacer minLength={4} />
          {returnPill(true)}
        </HStack>
      </VStack>
    ),
  };
}

export default createLiveActivity("MatesCallActivity", CallLiveActivityView);
