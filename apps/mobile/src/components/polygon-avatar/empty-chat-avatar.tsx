import { PolygonAvatar } from "./polygon-avatar";
import { View } from "react-native";

const AVATAR_SIZE = 120;

export function EmptyChatAvatar({ gradient }: { gradient?: [string, string, string] }) {
  return (
    <View
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible",
      }}
    >
      <PolygonAvatar state="idle" size={AVATAR_SIZE} gradient={gradient} />
    </View>
  );
}
