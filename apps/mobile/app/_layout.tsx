import "../src/monitoring/init";
import "../src/style-entry";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { DataProvider } from "../src/data/provider";
import { OnboardingProvider } from "../src/onboarding/provider";
import { SessionProvider } from "../src/session/provider";
import { ThemeProvider } from "../src/theme/provider";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <ThemeProvider>
        <SessionProvider>
          <DataProvider>
            <OnboardingProvider>
              <Stack screenOptions={{ headerShown: false }} />
            </OnboardingProvider>
          </DataProvider>
        </SessionProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
