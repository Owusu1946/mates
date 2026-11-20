import { Text, View } from "react-native";
import { friendColour } from "./data";

/** A friend's initial on their own warm colour. */
export function FriendAvatar({ userId, name, size = 40 }: { userId: string; name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: friendColour(userId), alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#ffffff", fontFamily: "DMSans_600SemiBold", fontSize: size * 0.42 }}>{(name.trim()[0] ?? "?").toUpperCase()}</Text>
    </View>
  );
}
