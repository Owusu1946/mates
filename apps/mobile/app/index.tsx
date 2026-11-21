import { Redirect } from "expo-router";
import { getSharedPayloads } from "expo-sharing";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { features } from "../src/expojet-features";
import { useOnboarding } from "../src/onboarding/provider";
import { useSession } from "../src/session/provider";

export default function IndexScreen() {
  const session = useSession();
  const onboarding = useOnboarding();
  if (session.status === "loading" || onboarding.status === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }
  // The introduction is for newcomers; people already signed in go straight to the app.
  if (features.onboarding && !onboarding.complete && session.status === "unauthenticated") return <Redirect href="/(onboarding)" />;
  if (session.status === "unauthenticated") return <Redirect href="/(public)/sign-in" />;
  // The share intent survives the sign-in route while this Android process stays alive.
  if (Platform.OS === "android" && getSharedPayloads().length) return <Redirect href="/(app)/share-receive" />;
  return <Redirect href="/(app)" />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
