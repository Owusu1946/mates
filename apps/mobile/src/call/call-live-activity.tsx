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
  const ink       = dark ? "#FAFAFA" : "#18181B";
  const secondary = dark ? "#A1A1AA" : "#71717A";
  const subtle    = dark ? "#3F3F46" : "#D4D4D8";
  const surface   = dark ? "#111113" : "#F7F6F3";
  const accent    = "#E5A36F";
  const mutedRed  = "#EE9C8C";
  // Each mate carries their own gradient — use it to personalize the glow.
  const mateGlow  = featured?.gradient[1] ?? accent;

  // ── Derived state ────────────────────────────────────────────────────
  const reconnecting = props.reconnecting || environment.isStale === true;
  const title = lead
    ? `${lead.name}${mates.length > 1 ? ` + ${mates.length - 1}` : ""}`
    : "Your call";
  const subtitle = mates.length > 1
    ? `with ${mates.map((m) => m.name).join(", ")}`
    : undefined;
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
  const isSpeaking = !reconnecting && !props.isMuted && !!speaker;
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

  /** Portrait wrapped in a soft colored circle — makes the mascot pop against dark backgrounds. */
  const glowPortrait = (mate: CallActivityMate | undefined, size: number, glowSize: number, glowOpacity: number) => {
    const glow = mate?.gradient[1] ?? accent;
    return (
      <ZStack alignment="center">
        {!dimmed && (
          <HStack modifiers={[
            frame({ width: glowSize, height: glowSize }),
            background(glow, shapes.circle()),
            opacity(glowOpacity),
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

  /** Roster strip — small portraits with individual glow rings. */
  const roster = (size: number) => (
    <HStack spacing={4} modifiers={[accessibilityLabel(mates.map((m) => m.name).join(", "))]}>
      {mates.map((mate) => (
        <HStack key={mate.id}>{glowPortrait(mate, size, size + 6, 0.15)}</HStack>
      ))}
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
    // │ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ accent strip ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │
    // │  ┌──────┐  Title + N              Timer                       │
    // │  │ hero │  🎵 Status                                          │
    // │  └──────┘  with PA, Fav Intern, Prof                          │
    // │  ○ ○ ○ ○                    [ Return → ]                      │
    // └────────────────────────────────────────────────────────────────┘
    banner: (
      <VStack spacing={0} modifiers={[activityBackgroundTint(surface)]}>
        {/* Accent strip — thin brand-colored bar across the top */}
        <HStack modifiers={[
          frame({ height: 3 }),
          background({ type: "linearGradient", colors: [mateGlow, accent], startPoint: { x: 0, y: 0.5 }, endPoint: { x: 1, y: 0.5 } }),
        ]}>
          <Spacer minLength={0} />
        </HStack>

        <VStack spacing={14} modifiers={[padding({ horizontal: 20, top: 16, bottom: 18 })]}>
          {/* Hero row */}
          <HStack spacing={16}>
            {glowPortrait(featured, 80, 94, 0.22)}
            <VStack alignment="leading" spacing={5}>
              <Text modifiers={[
                font({ size: 22, weight: "bold", design: "rounded" }),
                foregroundStyle(ink),
                lineLimit(1),
              ]}>{title}</Text>
              {statusLine(11, 13, secondary)}
              {subtitle && (
                <Text modifiers={[
                  font({ size: 11, weight: "regular" }),
                  foregroundStyle(subtle),
                  lineLimit(1),
                  contentTransition("opacity"),
                ]}>{subtitle}</Text>
              )}
            </VStack>
            <Spacer minLength={0} />
            {clock(22, accent, 86)}
          </HStack>

          {/* Footer: roster + CTA */}
          <HStack spacing={8}>
            {roster(24)}
            <Spacer minLength={4} />
            {returnPill(false)}
          </HStack>
        </VStack>
      </VStack>
    ),

    // Small banner — shown when another Live Activity takes priority.
    bannerSmall: (
      <HStack spacing={10}>
        {glowPortrait(featured, 32, 38, 0.18)}
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
    //
    // Compact: mascot with colored glow on the left, live indicator + timer on the right.
    // The glow uses the mate's personal gradient color so each character has its own feel.
    compactLeading: glowPortrait(featured, 26, 32, 0.25),

    compactTrailing: props.isMuted ? (
      <Image systemName="mic.slash.fill" color={mutedRed} size={14}
        modifiers={[frame({ width: 24, height: 24 }), contentTransition("opacity")]} />
    ) : reconnecting ? (
      <Image systemName="arrow.trianglehead.2.clockwise.rotate.90" color={subtle} size={13}
        modifiers={[frame({ width: 24, height: 24 }), contentTransition("opacity")]} />
    ) : (
      <HStack spacing={5}>
        {/* Waveform icon pulses with content transition when speaker changes */}
        <Image systemName={isSpeaking ? "waveform" : "waveform.badge.mic"} color={accent} size={11}
          modifiers={[frame({ width: 16, height: 16 }), contentTransition("opacity")]} />
        {clock(12, accent, 48)}
      </HStack>
    ),

    // Minimal: mascot with glow — recognizable even at tiny size.
    minimal: glowPortrait(featured, 24, 28, 0.25),

    // Expanded: long-press reveals full call details.
    expandedLeading: (
      <Image systemName={statusSymbol} color={statusColor} size={13}
        modifiers={[padding({ leading: 6, top: 4 }), contentTransition("opacity")]} />
    ),

    expandedTrailing: clock(15, accent, 72),

    // ┌────────────────────────────────────────────────────────────────┐
    // │  🎵 icon     Title + N             Timer                      │
    // │                                                                │
    // │  ┌──────┐  Name                                               │
    // │  │ hero │  🎵 Status                                          │
    // │  └──────┘  with PA, Fav Intern, Prof                          │
    // │                                                                │
    // │  ○ ○ ○ ○                    [ Return → ]                      │
    // └────────────────────────────────────────────────────────────────┘
    expandedBottom: (
      <VStack spacing={14} modifiers={[padding({ horizontal: 6, top: 8, bottom: 6 })]}>
        {/* Hero: avatar + title/status */}
        <HStack spacing={14}>
          {glowPortrait(featured, 72, 86, 0.22)}
          <VStack alignment="leading" spacing={5}>
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
            {subtitle && (
              <Text modifiers={[
                font({ size: 11, weight: "regular" }),
                foregroundStyle("#52525B"),
                lineLimit(1),
              ]}>{subtitle}</Text>
            )}
          </VStack>
          <Spacer minLength={0} />
        </HStack>

        {/* Footer: roster + CTA */}
        <HStack spacing={8}>
          {roster(22)}
          <Spacer minLength={4} />
          {returnPill(true)}
        </HStack>
      </VStack>
    ),
  };
}

export default createLiveActivity("MatesCallActivity", CallLiveActivityView);
