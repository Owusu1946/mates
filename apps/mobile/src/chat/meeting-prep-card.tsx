import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { createApiClient } from "../data/api";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import { CardButton } from "./card-button";
import { ChatIcon } from "./chat-icon";

const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold" };

/**
 * A brief before a calendar meeting: who's coming and when you last spoke, what's still open,
 * what you usually do, and the offer to send the mate to take notes. Set like a reply.
 */
export function MeetingPrepCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const prep = state.prep;
  const [joining, setJoining] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  if (!prep) return null;
  const starts = new Date(prep.startsAt);
  const started = starts.getTime() < Date.now() - 60 * 60_000;

  const sendMate = async () => {
    if (!prep.meetingUrl) return;
    setJoining("sending");
    setError(null);
    try {
      const response = await api.v1.meetings.$post({ json: { meetingUrl: prep.meetingUrl, mateId: prep.mateId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `${prep.mateName} couldn’t join.`);
      }
      setJoining("sent");
      haptic.success();
    } catch (cause) {
      setJoining("idle");
      setError(cause instanceof Error ? cause.message : `${prep.mateName} couldn’t join.`);
      haptic.error();
    }
  };

  return (
    <View testID="meeting-prep-card" style={{ gap: 10, paddingVertical: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <ChatIcon name="clock" color={colors.primary} size={15} />
        <Text style={{ color: colors.textMuted, fontFamily: font.medium, fontSize: 13 }}>
          Meeting prep · {starts.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </Text>
      </View>
      <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 18 }}>{prep.title}</Text>
      <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 21 }}>{prep.brief}</Text>

      <View style={{ gap: 4 }}>
        {prep.attendees.slice(0, 6).map((person) => (
          <Text key={person.email} style={{ color: colors.text, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>
            {person.name ?? person.email}
            {person.lastContact ? <Text style={{ color: colors.textMuted }}>{` · ${person.lastContact}`}</Text> : null}
          </Text>
        ))}
        {prep.attendees.length > 6 ? <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 13 }}>{`and ${prep.attendees.length - 6} more`}</Text> : null}
      </View>

      {prep.openItems.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 14 }}>Still open</Text>
          {prep.openItems.map((item, i) => (
            <Text key={i} style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>{`•  ${item}`}</Text>
          ))}
        </View>
      )}

      {prep.usual ? <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 13, lineHeight: 18 }}>Usually: {prep.usual}</Text> : null}

      {prep.meetingUrl && !started && (
        <View style={{ flexDirection: "row", gap: 8, paddingTop: 2 }}>
          <CardButton
            label={joining === "sent" ? `${prep.mateName} is joining` : joining === "sending" ? "Sending…" : `Send ${prep.mateName} to take notes`}
            disabled={joining !== "idle"}
            onPress={() => void sendMate()}
          />
        </View>
      )}
      {error && <Text style={{ color: colors.error, fontSize: 13 }}>{error}</Text>}
    </View>
  );
}
