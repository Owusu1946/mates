import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";
import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityLabel, activityBackgroundTint, aspectRatio, contentTransition,
  font, foregroundStyle, frame, lineLimit, monospacedDigit, multilineTextAlignment,
  padding, resizable, widgetAccentedRenderingMode,
} from "@expo/ui/swift-ui/modifiers";

export type CallActivityMate = {
  id: string;
  name: string;
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
  const reconnecting = props.reconnecting || environment.isStale === true;
  const speaker = reconnecting ? undefined : mates.find((mate) => mate.id === props.speakerId);
  const dimmed = environment.isLuminanceReduced === true;
  const dark = props.isDark || dimmed;

  // ── Palette ──────────────────────────────────────────────────────────
  const ink       = dark ? "#FAFAFA" : "#18181B";
  const secondary = dark ? "#A1A1AA" : "#71717A";
  const surface   = dark ? "#111113" : "#F7F6F3";
  const accent    = dark ? "#E5A36F" : "#AD5A28";
  const islandAccent = "#E5A36F";
  const mutedRed  = "#EE9C8C";
  // Each mate carries their own gradient — use it to personalize the glow.
  // ── Derived state ────────────────────────────────────────────────────
  const title = lead
    ? `${lead.name}${mates.length > 1 ? ` + ${mates.length - 1}` : ""}`
    : "Your call";
  const status = reconnecting
    ? "Reconnecting\u2026"
    : props.isMuted
      ? "Muted"
      : speaker
        ? `${speaker.name} is speaking`
        : "In call";
  const statusSymbol = reconnecting
    ? "arrow.trianglehead.2.clockwise.rotate.90"
    : props.isMuted
      ? "mic.slash.fill"
      : speaker
        ? "waveform"
        : "mic.fill";
  const statusColor = reconnecting ? secondary : props.isMuted ? (dark ? mutedRed : "#B44939") : accent;
  const islandStatusColor = reconnecting ? "#A1A1AA" : props.isMuted ? mutedRed : islandAccent;
  const timer = new Date(props.startedAtMs);

  // ── Atoms ────────────────────────────────────────────────────────────

  /** Bundled in the WidgetKit extension so both surfaces can load it reliably. */
  const portrait = (size: number) => {
    return (
      <Image assetName="MatesMascot" modifiers={[
        resizable(), aspectRatio({ contentMode: "fit" }), frame({ width: size, height: size }),
        widgetAccentedRenderingMode("fullColor"),
        contentTransition("opacity"),
        accessibilityLabel("Mates mascot"),
      ]} />
    );
  };

  /** Live timer with numericText content transition. */
  const clock = (size: number, color: string, width: number) => (
    <Text timerInterval={{ lower: timer, upper: new Date(timer.getTime() + 8 * 60 * 60 * 1000) }} countsDown={false} modifiers={[
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

  /** Participant count avoids implying that the brand mascot is a specific mate. */
  const roster = () => (
    <HStack spacing={6} modifiers={[accessibilityLabel(mates.map((mate) => mate.name).join(", "))]}>
      <Image systemName="person.2.fill" color={secondary} size={11} />
      <Text modifiers={[font({ size: 12, weight: "medium" }), foregroundStyle(secondary), lineLimit(1)]}>
        {mates.length} {mates.length === 1 ? "mate" : "mates"}
      </Text>
    </HStack>
  );

  // ── Surfaces ─────────────────────────────────────────────────────────

  return {
    banner: (
      <VStack spacing={0} modifiers={[activityBackgroundTint(surface)]}>
        <VStack spacing={12} modifiers={[padding({ horizontal: 20, top: 18, bottom: 16 })]}>
          {/* Hero row */}
          <HStack spacing={17}>
            {portrait(82)}
            <VStack alignment="leading" spacing={7}>
              <Text modifiers={[
                font({ size: 23, weight: "bold", design: "rounded" }),
                foregroundStyle(ink),
                lineLimit(1),
              ]}>{title}</Text>
              {statusLine(12, 14, secondary)}
            </VStack>
            <Spacer minLength={0} />
          </HStack>

          {/* Footer: roster + elapsed call time */}
          <HStack spacing={8}>
            {roster()}
            <Spacer minLength={8} />
            {clock(16, ink, 96)}
          </HStack>
        </VStack>
      </VStack>
    ),

    // Compact layout for Apple Watch and CarPlay.
    bannerSmall: (
      <HStack spacing={10}>
        {portrait(32)}
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
    // Keep the mascot and duration in separate compact regions so neither is clipped.
    compactLeading: portrait(24),
    compactTrailing: clock(11, islandAccent, 44),

    // Minimal: recognizable shape when another Live Activity takes priority.
    minimal: portrait(22),

    // Expanded: long-press reveals full call details.
    expandedLeading: (
      <Image systemName={statusSymbol} color={islandStatusColor} size={13}
        modifiers={[padding({ leading: 6, top: 4 }), contentTransition("opacity")]} />
    ),

    expandedTrailing: (
      <Image systemName={props.speakerOn ? "speaker.wave.2.fill" : "ear"}
        color={islandStatusColor} size={14}
        modifiers={[padding({ trailing: 6, top: 4 }), accessibilityLabel(props.speakerOn ? "Speakerphone" : "Earpiece")]} />
    ),

    expandedBottom: (
      <VStack spacing={10} modifiers={[padding({ horizontal: 6, top: 6, bottom: 4 })]}>
        {/* Hero: avatar + title/status */}
        <HStack spacing={13}>
          {portrait(58)}
          <VStack alignment="leading" spacing={5}>
            <Text modifiers={[
              font({ size: 21, weight: "bold", design: "rounded" }),
              foregroundStyle("#FAFAFA"),
              lineLimit(1),
            ]}>{title}</Text>
            <HStack spacing={5}>
              <Image systemName={statusSymbol} size={11} color={islandStatusColor}
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

        {/* Footer: roster + elapsed call time */}
        <HStack spacing={8}>
          {roster()}
          <Spacer minLength={2} />
          {clock(14, islandAccent, 52)}
        </HStack>
      </VStack>
    ),
  };
}

export default createLiveActivity("MatesCallActivity", CallLiveActivityView);
