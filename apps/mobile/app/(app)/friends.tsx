import { useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, ScrollView, Share, Switch, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { ChatIcon } from "../../src/chat/chat-icon";
import { useToast } from "../../src/components/toast";
import { useFriendActions, useFriends, type EmailInviteStatus, type Friend } from "../../src/friends/data";
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

/**
 * Friends: people whose mates can find times with yours. Invite by link (WhatsApp, SMS…) or by
 * email, accept requests, and choose per friend whether your mate shares when you're free or asks.
 */
export default function FriendsScreen() {
  const { colors } = useTheme();
  const toast = useToast();
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
  const more = (friend: Friend) => {
    const remove = () =>
      Alert.alert(`Remove ${friend.name}?`, "Your mates won’t find times together any more. You can connect again later.", [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => actions.remove.mutate(friend.userId) },
      ]);
    const block = () =>
      Alert.alert(`Block ${friend.name}?`, "They won’t be able to reach you or connect again. They aren’t told.", [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: () => actions.block.mutate(friend.userId) },
      ]);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ title: friend.name, options: ["Remove friend", "Block", "Cancel"], destructiveButtonIndex: [0, 1], cancelButtonIndex: 2 }, (i) => (i === 0 ? remove() : i === 1 ? block() : undefined));
    } else {
      Alert.alert(friend.name, undefined, [{ text: "Remove friend", onPress: remove }, { text: "Block", style: "destructive", onPress: block }, { text: "Cancel", style: "cancel" }]);
    }
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
          <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 20, textAlign: "center" }}>Find times with friends</Text>
          <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 320 }}>
            Connect with a friend, then just say “find a time with Ama for lunch”. Your mates agree on a time, and it lands in both your calendars.
          </Text>
        </Animated.View>
      ) : (
        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22 }}>
          Your mates find times with your friends’ mates. Say “find a time with Ama for lunch” in any chat.
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
              <Pressable key={friend.userId} onLongPress={() => more(friend)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 14, paddingRight: 10, paddingVertical: 12 }}>
                <FriendAvatar userId={friend.userId} name={friend.name} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 15.5 }}>{friend.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13 }}>
                    {friend.share === "auto" ? "Shares when you’re free" : "Asks you each time"}
                  </Text>
                </View>
                <Switch
                  accessibilityLabel={`Share when you’re free with ${friend.name}`}
                  value={friend.share === "auto"}
                  onValueChange={(on) => { haptic.selection(); actions.setShare.mutate({ friend: friend.userId, share: on ? "auto" : "ask" }); }}
                />
                <Pressable accessibilityRole="button" accessibilityLabel={`More for ${friend.name}`} hitSlop={8} onPress={() => more(friend)} style={{ paddingLeft: 4 }}>
                  <ChatIcon name="more" color={colors.textMuted} size={20} />
                </Pressable>
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
        Friends’ mates only ever see when you’re free, never what you’re doing. Nothing goes in your calendar until you pick a time. Turn sharing off for anyone, and your mate asks you first.
      </Text>
    </ScrollView>
  );
}
