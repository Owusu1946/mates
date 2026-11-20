import { useState } from "react";
import { useRouter } from "expo-router";
import { Alert, Platform, Pressable, RefreshControl, ScrollView, Share, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { ChatIcon } from "../../src/chat/chat-icon";
import { useToast } from "../../src/components/toast";
import { useFriendActions, useFriends, type EmailInviteStatus, type FriendPermissions } from "../../src/friends/data";
import { FriendAvatar } from "../../src/friends/friend-avatar";
import { haptic } from "../../src/haptics";
import { usePullToRefresh } from "../../src/hooks/use-pull-to-refresh";
import { font, Group, SmallButton } from "../../src/memory/memory-ui";
import { useTheme } from "../../src/theme/provider";

const EMAIL_RESULT: Record<EmailInviteStatus, { message: string; tone: "success" | "info" | "error" }> = {
  sent: { message: "Request sent. They’ll see it in Friends.", tone: "success" },
  already_sent: { message: "You’ve already asked them. Waiting for them to accept.", tone: "info" },
  already_friends: { message: "You’re already friends.", tone: "info" },
  self: { message: "That’s your own email.", tone: "info" },
  not_found: { message: "", tone: "info" },
};

/** One line for what a friend's mate may do without asking. */
function summary(p: FriendPermissions) {
  const allowed = [p.freeTimes && "free times", p.messages && "updates", p.answers && "answers"].filter(Boolean) as string[];
  if (!allowed.length) return "Asks you before anything";
  const list = allowed.length > 1 ? `${allowed.slice(0, -1).join(", ")} and ${allowed.at(-1)}` : allowed[0]!;
  return list.charAt(0).toUpperCase() + list.slice(1);
}

/**
 * Friends: people whose mates work with yours. Invite by link (WhatsApp, SMS…) or by
 * email, accept requests, and choose per friend whether your mate shares when you're free or asks.
 */
export default function FriendsScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const friends = useFriends();
  const actions = useFriendActions();
  const pull = usePullToRefresh(() => friends.refetch());
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const data = friends.data;
  const empty = friends.isSuccess && !data?.friends.length && !data?.requests.length && !data?.sent.length;

  const shareLink = async () => {
    haptic.light();
    try {
      const link = await actions.createLink.mutateAsync();
      await Share.share(Platform.OS === "ios" ? { message: link.message.replace(` ${link.url}`, ""), url: link.url } : { message: link.message });
    } catch (error) {
      toast.show({ message: error instanceof Error ? error.message : "Couldn’t make an invite.", tone: "error" });
    }
  };
  const sendEmail = async () => {
    const value = email.trim();
    if (!value) return;
    try {
      const status = await actions.inviteByEmail.mutateAsync(value);
      if (status === "not_found") {
        Alert.alert("They’re not on Mates yet", "Send them an invite link instead. It works in WhatsApp, SMS or anywhere.", [
          { text: "Not now", style: "cancel" },
          { text: "Send a link", onPress: () => void shareLink() },
        ]);
        return;
      }
      haptic.success();
      toast.show(EMAIL_RESULT[status]);
      setEmail("");
      setAdding(false);
    } catch (error) {
      toast.show({ message: error instanceof Error ? error.message : "Couldn’t send that.", tone: "error" });
    }
  };
  const accept = (code: string, name: string) => {
    haptic.success();
    actions.accept.mutate(code, {
      onSuccess: () => toast.show({ message: `You and ${name} are friends now.`, tone: "success" }),
      onError: (error) => toast.show({ message: error.message, tone: "error" }),
    });
  };
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 56, gap: 22 }}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      {empty ? (
        <Animated.View entering={FadeIn.duration(220)} style={{ alignItems: "center", gap: 14, paddingTop: 24, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row" }}>
            <FriendAvatar userId="you" name="Y" size={56} />
            <View style={{ marginLeft: -14, borderRadius: 32, borderWidth: 4, borderColor: colors.background }}><FriendAvatar userId="ama" name="A" size={56} /></View>
          </View>
          <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 20, textAlign: "center" }}>Your mates, working with your friends’</Text>
          <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 320 }}>
            Connect with a friend and your mates handle the back-and-forth: finding a time, passing on updates, answering questions. You choose what each friend’s mate can do.
          </Text>
        </Animated.View>
      ) : (
        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22 }}>
          Your mates work with your friends’ mates. Try “find a time with Ama for lunch” or “tell Kofi I’m running late” in any chat.
        </Text>
      )}

      <View style={{ gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void shareLink()}
          disabled={actions.createLink.isPending}
          style={({ pressed }) => ({ height: 52, borderRadius: 16, borderCurve: "continuous", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.text, opacity: actions.createLink.isPending ? 0.6 : pressed ? 0.85 : 1 })}
        >
          <ChatIcon name="share" color={colors.background} size={19} />
          <Text style={{ color: colors.background, fontFamily: font.semibold, fontSize: 16 }}>Invite a friend</Text>
        </Pressable>
        {adding ? (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              autoFocus
              value={email}
              onChangeText={setEmail}
              placeholder="Their email"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={() => void sendEmail()}
              style={{ flex: 1, height: 46, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface, color: colors.text, fontFamily: font.regular, fontSize: 15 }}
            />
            <SmallButton label={actions.inviteByEmail.isPending ? "Sending…" : "Send"} strong disabled={!email.trim() || actions.inviteByEmail.isPending} onPress={() => void sendEmail()} />
          </Animated.View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setAdding(true)} hitSlop={6} style={({ pressed }) => ({ alignSelf: "center", paddingVertical: 6, opacity: pressed ? 0.5 : 1 })}>
            <Text style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 14.5 }}>Add someone already on Mates by email</Text>
          </Pressable>
        )}
      </View>

      {friends.isError && <Text style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>Couldn’t load your friends. Pull down to try again.</Text>}

      {!!data?.requests.length && (
        <Animated.View layout={LinearTransition.duration(200)} style={{ gap: 8 }}>
          <Text style={{ color: colors.textSecondary, fontFamily: font.semibold, fontSize: 13, letterSpacing: 0.3, textTransform: "uppercase" }}>Requests</Text>
          <Group>
            {data.requests.map((request) => (
              <View key={request.code} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
                <FriendAvatar userId={request.code} name={request.name} />
                <Text style={{ flex: 1, color: colors.text, fontFamily: font.medium, fontSize: 15 }}>{request.name} wants to connect</Text>
                <SmallButton label="Accept" strong disabled={actions.accept.isPending} onPress={() => accept(request.code, request.name)} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Decline ${request.name}`} hitSlop={8} onPress={() => { haptic.selection(); actions.decline.mutate(request.code); }}>
                  <ChatIcon name="close" color={colors.textMuted} size={20} />
                </Pressable>
              </View>
            ))}
          </Group>
        </Animated.View>
      )}

      {!!data?.friends.length && (
        <Animated.View layout={LinearTransition.duration(200)} style={{ gap: 8 }}>
          <Text style={{ color: colors.textSecondary, fontFamily: font.semibold, fontSize: 13, letterSpacing: 0.3, textTransform: "uppercase" }}>Friends</Text>
          <Group>
            {data.friends.map((friend) => (
              <Pressable key={friend.userId} accessibilityRole="button" onPress={() => router.push({ pathname: "/friend", params: { id: friend.userId } })} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 14, paddingRight: 12, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
                <FriendAvatar userId={friend.userId} name={friend.name} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 15.5 }}>{friend.name}</Text>
                  <Text numberOfLines={1} style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13 }}>{summary(friend.permissions)}</Text>
                </View>
                <ChatIcon name="next" color={colors.textMuted} size={18} />
              </Pressable>
            ))}
          </Group>
        </Animated.View>
      )}

      {!!data?.sent.length && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.textSecondary, fontFamily: font.semibold, fontSize: 13, letterSpacing: 0.3, textTransform: "uppercase" }}>Waiting</Text>
          <Group>
            {data.sent.map((sent) => (
              <View key={sent.code} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, opacity: 0.7 }}>
                <FriendAvatar userId={sent.code} name={sent.name} size={32} />
                <Text style={{ flex: 1, color: colors.textSecondary, fontFamily: font.regular, fontSize: 14.5 }}>Waiting for {sent.name} to accept</Text>
              </View>
            ))}
          </Group>
        </View>
      )}

      <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 13, lineHeight: 19 }}>
        Tap a friend to choose what their mate can do without asking you. Free times never show what you’re doing, and nothing goes in your calendar until you pick a time.
      </Text>
    </ScrollView>
  );
}
