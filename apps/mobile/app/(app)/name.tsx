import { useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { useToast } from "../../src/components/toast";
import { NameField } from "../../src/friends/name-field";
import { useTheme } from "../../src/theme/provider";

/** Settings → Your name: the name friends and their mates know you by. */
export default function NameScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20 }}>
      <NameField onSaved={(name) => { toast.show({ message: `Friends will see “${name}”.`, tone: "success" }); router.back(); }} />
    </ScrollView>
  );
}
