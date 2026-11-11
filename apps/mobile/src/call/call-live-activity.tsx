import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";
import { HStack, Image, Text, VStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle } from "@expo/ui/swift-ui/modifiers";

export type CallLiveActivityProps = {
  callId: string;
  leadName: string;
  participantNames: string[];
  startedAtMs: number;
  isMuted: boolean;
  speakerOn: boolean;
  speakerName: string | null;
};

function CallLiveActivityView(props: CallLiveActivityProps, environment: LiveActivityEnvironment) {
  "widget";

  const accent = environment.isLuminanceReduced ? "#FFFFFF" : "#46A979";
  const participants = props.participantNames.join(", ");
  const timer = new Date(props.startedAtMs);

  return {
    banner: (
      <HStack spacing={12}>
        <Image systemName="phone.fill" color={accent} />
        <VStack alignment="leading" spacing={4}>
          <Text modifiers={[font({ weight: "semibold" })]}>
            On a call with {props.leadName}
          </Text>
          <Text date={timer} dateStyle="timer" />
          {participants.length > 0 && (
            <Text modifiers={[foregroundStyle({ type: "hierarchical", style: "secondary" })]}>
              {participants}
            </Text>
          )}
          {props.speakerName && (
            <Text modifiers={[foregroundStyle({ type: "hierarchical", style: "secondary" })]}>
              Speaking: {props.speakerName}
            </Text>
          )}
        </VStack>
      </HStack>
    ),
    compactLeading: <Image systemName="phone.fill" color={accent} />,
    compactTrailing: <Text date={timer} dateStyle="timer" />,
    minimal: <Image systemName="phone.fill" color={accent} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={4}>
        <Image systemName="phone.fill" color={accent} />
        <Text modifiers={[font({ size: 12, weight: "semibold" })]}>{props.leadName}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={4}>
        <Text date={timer} dateStyle="timer" />
        <HStack spacing={4}>
          <Image systemName={props.isMuted ? "mic.slash.fill" : "mic.fill"} color={accent} />
          <Text>{props.isMuted ? "Muted" : props.speakerOn ? "Speaker" : "Earpiece"}</Text>
        </HStack>
      </VStack>
    ),
    expandedBottom: (
      <VStack alignment="leading" spacing={4}>
        <Text>{participants.length > 0 ? `With ${participants}` : "Just you and your mate"}</Text>
        {props.speakerName && <Text>Speaking: {props.speakerName}</Text>}
      </VStack>
    ),
  };
}

export default createLiveActivity("MatesCallActivity", CallLiveActivityView);
