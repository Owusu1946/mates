import { ScrollView, Text, View } from "react-native";
import { CooperMark } from "./auth/cooper-mark";
import { Icon, type IconName } from "./ui/icon";
import { useTheme } from "../theme/provider";

export function AppSection({
  title,
  eyebrow,
  message,
  icon,
  testID,
}: {
  title: string;
  eyebrow: string;
  message: string;
  icon?: IconName;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      testID={testID}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32 }}
    >
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 34, fontWeight: "700", letterSpacing: -1 }}>
        {title}
      </Text>
      <View style={{ flexGrow: 1, justifyContent: "center", alignItems: "center", gap: 16, paddingBottom: 40 }}>
        {icon ? (
          <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" }}>
            <Icon name={icon} size={28} color={colors.primary} />
          </View>
        ) : <CooperMark compact />}
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "600", textAlign: "center" }}>{eyebrow}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 16, lineHeight: 24, textAlign: "center", maxWidth: 300 }}>{message}</Text>
      </View>
    </ScrollView>
  );
}
