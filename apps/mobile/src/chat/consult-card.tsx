import type { WorkflowCard } from "@expojet/api-contract";
import { Text, View } from "react-native";
import { MateAvatar } from "../mates/mate-avatar";
import { useTheme } from "../theme/provider";

/** "Checked with Esi": a mate looked at what another mate knows about you before answering. */
export function ConsultCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const consult = state.consult;
  if (!consult) return null;
  return (
    <View
      accessibilityLabel={`${state.label}: ${consult.question}`}
      style={{ alignSelf: "flex-start", maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginVertical: 4 }}
    >
      <MateAvatar gradient={consult.mate.gradient} shape={consult.mate.shape} size={22} still />
      <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.textMuted, fontSize: 13, fontFamily: "DMSans_500Medium" }}>
        <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold" }}>{state.label}</Text>
        {consult.found ? "" : " · nothing yet"}
      </Text>
    </View>
  );
}
