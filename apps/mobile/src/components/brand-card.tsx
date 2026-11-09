import { Text, View } from "react-native";
import { GlassCard } from "./ui/glass-card";
import { CooperMark } from "./auth/cooper-mark";
import { useTheme } from "../theme/provider";

export function BrandCard() {
  const { colors } = useTheme();
  return (
    <GlassCard style={{ gap: 8 }}>
      <View className="flex-row items-center gap-2">
        <CooperMark compact />
        <Text
          className="text-xs font-bold tracking-widest text-blue-600 dark:text-blue-400"
          style={{ color: colors.primary }}
        >
          MATES
        </Text>
      </View>
      <Text
        className="text-3xl font-bold text-slate-950 dark:text-slate-50"
        style={{ color: colors.text }}
      >
        What’s on your mind?
      </Text>
      <Text
        className="text-base text-slate-600 dark:text-slate-400"
        style={{ color: colors.textSecondary }}
      >
        Your space to think, plan, and get things done with your mates.
      </Text>
    </GlassCard>
  );
}
