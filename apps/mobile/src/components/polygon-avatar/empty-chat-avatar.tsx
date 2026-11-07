import { PolygonAvatar } from "./polygon-avatar";
import { shapeOf } from "./polygon-avatar-core";
import { View } from "react-native";

const AVATAR_SIZE = 120;

export function EmptyChatAvatar({ gradient, shape }: { gradient?: [string, string, string]; shape?: string }) {
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
      <PolygonAvatar state="idle" size={AVATAR_SIZE} gradient={gradient} shape={shapeOf(shape)} />
    </View>
  );
}
