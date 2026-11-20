import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatIcon } from "../../src/chat/chat-icon";
import { useToast } from "../../src/components/toast";
import { useFriendActions, useInvitePreview, type InvitePreview } from "../../src/friends/data";
import { FriendAvatar } from "../../src/friends/friend-avatar";
import { haptic } from "../../src/haptics";
import { font } from "../../src/memory/memory-ui";
import { useTheme } from "../../src/theme/provider";

const CLOSED: Partial<Record<InvitePreview["state"], { title: string; body: string }>> = {
  own: { title: "This is your invite", body: "Send it to a friend. When they accept, your mates can find times together." },
  used: { title: "This invite was already used", body: "Ask for a new link." },
  expired: { title: "This invite has expired", body: "Invites last two weeks. Ask for a new link." },
  unavailable: { title: "This invite doesn’t work", body: "Ask for a new link." },
};

/** Opened from an invite link (mates://connect?c=…): who's asking, what connecting means, one tap. */
export default function ConnectScreen() {
  const { c } = useLocalSearchParams<{ c?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const preview = useInvitePreview(c);
  const { accept } = useFriendActions();
  const invite = preview.data;
  const closed = invite ? CLOSED[invite.state] : undefined;
  const done = accept.isSuccess || invite?.state === "friends";
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const connect = () => {
    if (!c) return;
    haptic.light();
    accept.mutate(c, {
      onSuccess: () => haptic.success(),
      onError: (error) => { haptic.error(); toast.show({ message: error.message, tone: "error" }); },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20, paddingHorizontal: 24 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={close} style={{ alignSelf: "flex-end" }}>
        <ChatIcon name="close" color={colors.text} size={24} />
      </Pressable>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 18 }}>
        {preview.isPending ? (
          <ActivityIndicator />
        ) : !invite || preview.isError ? (
          <Message title="This invite doesn’t work" body="Check the link, or ask for a new one." />
        ) : closed ? (
          <Message title={closed.title} body={closed.body} />
        ) : (
          <>
            <Animated.View entering={ZoomIn.springify().damping(14)} style={{ flexDirection: "row", alignItems: "center" }}>
              <FriendAvatar userId={c ?? invite.name} name={invite.name} size={76} />
              {done && (
                <Animated.View entering={ZoomIn.delay(120).springify()} style={{ marginLeft: -18, width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: colors.background, backgroundColor: colors.text, alignItems: "center", justifyContent: "center" }}>
                  <ChatIcon name="check" color={colors.background} size={20} />
                </Animated.View>
              )}
            </Animated.View>
            <Animated.View key={done ? "done" : "ask"} entering={FadeInDown.duration(260)} style={{ alignItems: "center", gap: 10 }}>
              <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 24, textAlign: "center" }}>
                {done ? `You and ${invite.name} are friends` : `${invite.name} wants to connect`}
              </Text>
              <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 16, lineHeight: 23, textAlign: "center", maxWidth: 320 }}>
                {done
                  ? `Try “find a time with ${invite.name} for lunch” in any chat. Your mates sort out the rest.`
                  : "Your mates can find times together. They’ll only see when you’re free, never what you’re doing, and nothing goes in your calendar until you pick a time."}
              </Text>
            </Animated.View>
          </>
        )}
      </View>

      {invite && !closed && !preview.isError && (
        <Animated.View entering={FadeIn.delay(150)} style={{ gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            disabled={accept.isPending}
            onPress={done ? close : connect}
            style={({ pressed }) => ({ height: 54, borderRadius: 17, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.text, opacity: accept.isPending ? 0.6 : pressed ? 0.85 : 1 })}
          >
            <Text style={{ color: colors.background, fontFamily: font.semibold, fontSize: 16.5 }}>{accept.isPending ? "Connecting…" : done ? "Done" : "Connect"}</Text>
          </Pressable>
          {!done && (
            <Pressable accessibilityRole="button" onPress={close} hitSlop={6} style={({ pressed }) => ({ alignSelf: "center", paddingVertical: 8, opacity: pressed ? 0.5 : 1 })}>
              <Text style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 15 }}>Not now</Text>
            </Pressable>
          )}
        </Animated.View>
      )}
    </View>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: "center", gap: 8 }}>
      <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 20, textAlign: "center" }}>{title}</Text>
      <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 300 }}>{body}</Text>
    </Animated.View>
  );
}
