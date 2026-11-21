import type { WorkflowCard } from "@expojet/api-contract";
import { Text, View } from "react-native";
import { useTheme } from "../theme/provider";

/** The lead mate's decision summary, after the individual replies in the chat. */
export function ComparisonCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const comparison = state.comparison;
  if (!comparison) return null;

  const { perMate, disagreements, failedMates, lead, suggestion } = comparison;
  const agreement = perMate.length > 1 && disagreements.length === 0;
  const failedNames = failedMates.map((mate) => mate.name).join(" and ");

  return (
    <View
      testID="mate-comparison-card"
      style={{ marginVertical: 8, padding: 16, gap: 14, borderRadius: 20, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
    >
      <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 16 }}>
        {perMate.length ? "What your mates recommend" : "No recommendations yet"}
      </Text>

      {perMate.map(({ mate, recommendation, basis }, index) => (
        <View key={mate.id} style={{ gap: 4, paddingTop: index ? 12 : 0, borderTopWidth: index ? 1 : 0, borderTopColor: colors.border }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 5 }}>
            <Text selectable style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 14.5 }}>{mate.name}</Text>
            <Text selectable style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 12.5 }}>· {mate.role}</Text>
          </View>
          <Text selectable style={{ color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 14, lineHeight: 20 }}>{recommendation}</Text>
          <Text selectable style={{ color: colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 19 }}>Based on: {basis}</Text>
        </View>
      ))}

      {perMate.length > 1 && disagreements.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.textMuted, fontFamily: "DMSans_600SemiBold", fontSize: 12 }}>WHERE THEY DISAGREE</Text>
          {disagreements.map((point, index) => (
            <Text key={`${index}-${point}`} selectable style={{ color: colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 19 }}>
              {disagreements.length > 1 ? `${index + 1}. ` : ""}{point}
            </Text>
          ))}
        </View>
      ) : agreement ? (
        <Text selectable style={{ color: colors.textSecondary, fontFamily: "DMSans_500Medium", fontSize: 13 }}>
          {failedMates.length ? "The answers received agree." : "They agree."}
        </Text>
      ) : null}

      {failedMates.length > 0 ? (
        <Text selectable style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 19 }}>
          {failedNames} couldn't answer.
        </Text>
      ) : null}

      <View style={{ gap: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={{ color: colors.textMuted, fontFamily: "DMSans_600SemiBold", fontSize: 12 }}>
          {perMate.length ? `${lead.name}'s suggestion` : "What to do next"}
        </Text>
        <Text selectable style={{ color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 14, lineHeight: 20 }}>{suggestion}</Text>
      </View>
    </View>
  );
}
