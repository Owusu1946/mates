import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import { ChatIcon } from "../../src/chat/chat-icon";
import { AddMatesSheet } from "../../src/call/add-mates-sheet";
import { avatarState, formatDuration, useCall } from "../../src/call/call-model";
import { CallControl, font, GlassIconButton, GlassPillButton, MateAvatar, ParticipantTile, SelfTile, SpeakingRing, useCallColors } from "../../src/call/call-ui";
import { GlassContainer } from "expo-glass-effect";
import { useSession } from "../../src/session/provider";
import { clearOrphanedCallActivities, getCurrentCallActivityCallId } from "../../src/call/call-activity";

const GAP = 10;

export default function CallScreen() {
  const call = useCall();
  const colors = useCallColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activityCallId } = useLocalSearchParams<{ activityCallId?: string | string[] }>();
  const session = useSession();
  // A card from a previous process/call must never open a fresh call lobby for another mate.
  // Once accepted, preserve the normal ended-call screen when this call finishes.
  const acceptedActivityCallId = useRef<string | null>(null);
  if (typeof activityCallId === "string" && activityCallId === getCurrentCallActivityCallId()) {
    acceptedActivityCallId.current = activityCallId;
  }
  // During an active call (connecting/live), never redirect on a stale activity link —
  // the user should see their current call. Orphan cleanup handles the old activity.
  const hasActiveCall = call.phase === "connecting" || call.phase === "live";
  const staleActivityLink = activityCallId !== undefined && (
    typeof activityCallId !== "string"
    || (acceptedActivityCallId.current !== activityCallId && !hasActiveCall)
  );
  useEffect(() => {
    if (staleActivityLink) void clearOrphanedCallActivities();
  }, [staleActivityLink]);
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const initials = (session.user?.displayName ?? "You").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

  if (staleActivityLink) return <Redirect href="/" />;

  return (
    <View testID="call-screen" style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {call.phase === "lobby" && <Lobby call={call} onClose={leave} />}
      {call.phase === "connecting" && <Connecting call={call} />}
      {call.phase === "live" && <Live call={call} initials={initials} onMinimize={leave} />}
      {call.phase === "ended" && <Ended call={call} onDone={() => { call.reset(); leave(); }} />}
    </View>
  );
}

type Call = ReturnType<typeof useCall>;

function Lobby({ call, onClose }: { call: Call; onClose: () => void }) {
  const colors = useCallColors();
  // Calling from a group brings its members along unless the user changes it.
  const { groupMembers, setInvited } = call;
  useEffect(() => {
    if (groupMembers.length) setInvited(groupMembers);
  }, [groupMembers, setInvited]);
  return (
    <Animated.View entering={FadeIn} style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, flexDirection: "row" }}>
        <GlassIconButton icon="close" label="Close" onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 28 }}>
        <View style={{ alignItems: "center", gap: 14 }}>
          <MateAvatar size={160} state="idle" gradient={call.lead.gradient} shape={call.lead.shape} />
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontFamily: font.bold, fontSize: 28 }}>Talk with {call.lead.name}</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: font.regular, fontSize: 15, textAlign: "center", maxWidth: 300, lineHeight: 22 }}>
            Hop on a voice call. Bring bot mates along to research, plan or create with you.
          </Text>
        </View>
        <View style={{ alignSelf: "stretch", gap: 12 }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.6 }}>BRING ALONG</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {call.available.map(mate => {
              const selected = call.invited.includes(mate.id);
              return (
                <Pressable
                  key={mate.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${mate.name}, ${mate.role}`}
                  onPress={() => call.toggleInvite(mate.id)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 6, paddingRight: 14, height: 48, borderRadius: 24,
                    backgroundColor: selected ? colors.controlActive : colors.tile, borderWidth: 1, borderColor: selected ? colors.controlActive : colors.tileBorder,
                  }}
                >
                  <MateAvatar size={36} gradient={mate.gradient} shape={mate.shape} still />
                  <View>
                    <Text style={{ color: selected ? colors.controlActiveForeground : colors.foreground, fontFamily: font.semibold, fontSize: 14 }}>{mate.name}</Text>
                    <Text style={{ color: selected ? colors.controlActiveForeground : colors.mutedForeground, fontFamily: font.regular, fontSize: 11, opacity: selected ? 0.75 : 1 }}>{mate.role}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 12 }}>
        {call.error && (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground, fontFamily: font.medium, fontSize: 14, textAlign: "center" }}>{call.error}</Text>
        )}
        {call.preview && (
          <Text style={{ color: colors.mutedForeground, fontFamily: font.regular, fontSize: 13, textAlign: "center" }}>
            Preview: real calls need the Mates app build.
          </Text>
        )}
        <GlassPillButton
          prominent
          icon="call"
          height={58}
          label={call.invited.length ? `Start call with ${call.invited.length + 1}` : "Start call"}
          onPress={call.start}
        />
      </View>
    </Animated.View>
  );
}

function Connecting({ call }: { call: Call }) {
  const colors = useCallColors();
  const coming = call.available.filter(m => call.invited.includes(m.id));
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 18 }}>
      <View style={{ width: 200, height: 200, alignItems: "center", justifyContent: "center" }}>
        <SpeakingRing active color={colors.speaking} radius={100} />
        <MateAvatar size={160} state="waking" gradient={call.lead.gradient} shape={call.lead.shape} />
      </View>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground, fontFamily: font.semibold, fontSize: 22 }}>Calling {call.lead.name}…</Text>
      {coming.length > 0 && (
        <Text style={{ color: colors.mutedForeground, fontFamily: font.regular, fontSize: 14 }}>
          {coming.map(m => m.name).join(", ")} will join once you're connected
        </Text>
      )}
      <View style={{ position: "absolute", bottom: 24 }}>
        <CallControl icon="callEnd" label="Cancel" danger size={66} onPress={call.cancel} />
      </View>
    </Animated.View>
  );
}

function Live({ call, initials, onMinimize }: { call: Call; initials: string; onMinimize: () => void }) {
  const colors = useCallColors();
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [sheetOpen, setSheetOpen] = useState(false);
  const count = call.members.length;
  const cols = count <= 2 ? 1 : 2;
  const rows = Math.ceil(count / cols);
  const tileHeight = rows ? (stage.height - GAP * (rows - 1)) / rows : 0;
  const halfWidth = (stage.width - GAP) / 2;
  const listening = !call.muted && !call.members.some(m => m.speaking);
  const speaking = call.members.find(m => m.speaking);

  return (
    <Animated.View entering={FadeIn} style={{ flex: 1 }}>
      <View style={{ height: 56, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <GlassIconButton icon="chevronDown" label="Minimize call" onPress={onMinimize} />
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: colors.foreground, fontFamily: font.semibold, fontSize: 16 }}>
            {count > 1 ? `${call.lead.name} + ${count - 1}` : call.lead.name}
          </Text>
          <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground, fontFamily: font.medium, fontSize: 12, fontVariant: ["tabular-nums"] }}>
            {call.reconnecting ? "Reconnecting…" : formatDuration(call.elapsed)}
          </Text>
        </View>
        <GlassIconButton icon="addUser" label="Add bot mates" onPress={() => setSheetOpen(true)} />
      </View>

      <View
        onLayout={e => setStage({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        style={{ flex: 1, marginHorizontal: 12, marginTop: 4, flexDirection: "row", flexWrap: "wrap", gap: GAP }}
      >
        {stage.height > 0 && call.members.map((member, index) => {
          const spansRow = cols === 1 || (count % 2 === 1 && index === count - 1);
          const width = spansRow ? stage.width : halfWidth;
          return (
            <Animated.View key={member.id} entering={FadeInDown.springify().damping(18)} exiting={FadeOut} layout={LinearTransition.springify().damping(20)}>
              <ParticipantTile
                name={member.name}
                role={member.role}
                state={avatarState(member, listening)}
                gradient={member.gradient}
                shape={member.shape}
                speaking={member.speaking}
                joining={member.status === "joining"}
                width={width}
                height={tileHeight}
                avatarSize={Math.max(56, Math.min(width, tileHeight) * 0.5)}
                onLongPress={member.id === call.lead.id ? undefined : () => call.remove(member.id)}
              />
            </Animated.View>
          );
        })}
        <View style={{ position: "absolute", right: 10, bottom: 10 }}>
          <SelfTile initials={initials} muted={call.muted} speaking={listening} />
        </View>
      </View>

      <View style={{ minHeight: 64, marginHorizontal: 16, marginTop: 12, justifyContent: "flex-end" }}>
        {call.captionsOn && call.captions.length > 0 && (
          <View accessibilityLiveRegion="polite" style={{ borderRadius: 18, backgroundColor: colors.caption, paddingHorizontal: 14, paddingVertical: 10, gap: 4 }}>
            {call.captions.slice(-2).map((line, i, all) => (
              <Animated.Text key={line.id} entering={FadeInDown} style={{ color: i === all.length - 1 ? colors.foreground : colors.mutedForeground, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>
                <Text style={{ fontFamily: font.semibold }}>{line.speaker}: </Text>{line.text}
              </Animated.Text>
            ))}
          </View>
        )}
        {!call.captionsOn && (
          <Text style={{ color: colors.mutedForeground, fontFamily: font.medium, fontSize: 13, textAlign: "center" }}>
            {call.muted ? "You're muted" : speaking ? `${speaking.name} is talking` : "Listening…"}
          </Text>
        )}
      </View>

      <GlassContainer spacing={10} style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 8, paddingVertical: 8, flexDirection: "row", justifyContent: "space-around" }}>
        <CallControl icon={call.muted ? "micOff" : "mic"} label={call.muted ? "Unmute" : "Mute"} active={call.muted} onPress={call.toggleMute} />
        <CallControl icon={call.speakerOn ? "speaker" : "speakerOff"} label="Speaker" active={!call.speakerOn} onPress={call.toggleSpeaker} />
        <CallControl icon="captions" label="Captions" active={call.captionsOn} onPress={call.toggleCaptions} />
        <CallControl icon="addUser" label="Add" onPress={() => setSheetOpen(true)} />
        <CallControl icon="callEnd" label="End" danger onPress={call.end} />
      </GlassContainer>

      <AddMatesSheet visible={sheetOpen} available={call.available} members={call.members} onInvite={call.invite} onRemove={call.remove} onClose={() => setSheetOpen(false)} />
    </Animated.View>
  );
}

function Ended({ call, onDone }: { call: Call; onDone: () => void }) {
  const colors = useCallColors();
  const members = call.summary?.members ?? [];
  return (
    <Animated.View entering={FadeIn} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 14 }}>
      <View style={{ flexDirection: "row" }}>
        {members.map((mate, i) => (
          <View key={mate.id} style={{ marginLeft: i ? -18 : 0, borderRadius: 40, backgroundColor: colors.background, padding: 3 }}>
            <MateAvatar size={72} state="happy" gradient={mate.gradient} shape={mate.shape} />
          </View>
        ))}
      </View>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontFamily: font.bold, fontSize: 26 }}>{call.summary?.dropped ? "Call dropped" : "Call ended"}</Text>
      <Text style={{ color: colors.mutedForeground, fontFamily: font.regular, fontSize: 15, textAlign: "center" }}>
        {formatDuration(call.summary?.duration ?? 0)} · with {members.map(m => m.name).join(", ") || call.lead.name}
      </Text>
      {!call.preview && (
        <Text style={{ color: colors.mutedForeground, fontFamily: font.regular, fontSize: 14, textAlign: "center", maxWidth: 300, lineHeight: 20 }}>
          {call.summary?.dropped ? "The connection was lost. A summary of what you said will still land in the chat." : "A summary and the transcript will be in the chat in a moment."}
        </Text>
      )}
      <View style={{ position: "absolute", left: 20, right: 20, bottom: 12, gap: 10 }}>
        <GlassPillButton prominent icon="call" height={54} fontSize={16} label="Call again" onPress={call.reset} />
        <GlassPillButton height={54} fontSize={16} label="Back to chat" onPress={onDone} />
      </View>
    </Animated.View>
  );
}
