import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useFriendActions, useFriends, type FriendPermissions } from "../../src/friends/data";
import { FriendAvatar } from "../../src/friends/friend-avatar";
import { haptic } from "../../src/haptics";
import { font, Group } from "../../src/memory/memory-ui";
import { useTheme } from "../../src/theme/provider";

const SWITCHES: { key: keyof FriendPermissions; title: string; detail: (name: string) => string }[] = [
  { key: "freeTimes", title: "See when you’re free", detail: (name) => `So your mates can find times with ${name}. Never what you’re doing.` },
  { key: "messages", title: "Pass on updates", detail: (name) => `Like “${name}’s running 10 minutes late”. They arrive in your chat.` },
  { key: "answers", title: "Get answers from your mate", detail: () => "Your mate answers their questions from what it knows about you. Off: it asks you first." },
];

/** One friend: what their mate may do with yours without asking you, and ending it. */
export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const friends = useFriends();
  const actions = useFriendActions();
  const friend = friends.data?.friends.find((f) => f.userId === id);

  if (!friend) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24 }}>
        <Stack.Screen options={{ title: "" }} />
        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15 }}>{friends.isPending ? "Loading…" : "You’re not connected to this person any more."}</Text>
      </View>
    );
  }

  const end = (kind: "remove" | "block") =>
    Alert.alert(
      kind === "remove" ? `Remove ${friend.name}?` : `Block ${friend.name}?`,
      kind === "remove" ? "Your mates stop working together. You can connect again later." : "They won’t be able to reach you or connect again. They aren’t told.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: kind === "remove" ? "Remove" : "Block",
          style: "destructive",
          onPress: () => {
            haptic.heavy();
            (kind === "remove" ? actions.remove : actions.block).mutate(friend.userId, { onSuccess: () => router.back() });
          },
        },
      ],
    );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 56, gap: 24 }}>
      <Stack.Screen options={{ title: friend.name }} />
      <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: "center", gap: 10 }}>
        <FriendAvatar userId={friend.userId} name={friend.name} size={72} />
        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14 }}>
          Friends since {new Date(friend.since).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
        </Text>
      </Animated.View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.textSecondary, fontFamily: font.semibold, fontSize: 13, letterSpacing: 0.3, textTransform: "uppercase" }}>
          {friend.name}’s mate can, without asking you
        </Text>
        <Group>
          {SWITCHES.map((item) => (
            <View key={item.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 16, paddingRight: 12, paddingVertical: 14 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 15.5 }}>{item.title}</Text>
                <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13, lineHeight: 18 }}>{item.detail(friend.name)}</Text>
              </View>
              <Switch
                accessibilityLabel={item.title}
                value={friend.permissions[item.key]}
                onValueChange={(on) => { haptic.selection(); actions.setPermissions.mutate({ friend: friend.userId, change: { [item.key]: on } }); }}
              />
            </View>
          ))}
        </Group>
        <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 13, lineHeight: 19, paddingHorizontal: 4 }}>
          Anything else they ask for (a file, an address, a booking) waits for your OK, and you can choose Always allow.
        </Text>
      </View>

      <Group>
        <Pressable onPress={() => end("remove")} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 15, opacity: pressed ? 0.5 : 1 })}>
          <Text style={{ color: colors.error, fontFamily: font.medium, fontSize: 15.5 }}>Remove friend</Text>
        </Pressable>
        <Pressable onPress={() => end("block")} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 15, opacity: pressed ? 0.5 : 1 })}>
          <Text style={{ color: colors.error, fontFamily: font.medium, fontSize: 15.5 }}>Block</Text>
        </Pressable>
      </Group>
    </ScrollView>
  );
}
