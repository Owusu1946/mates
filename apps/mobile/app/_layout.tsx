import "../src/monitoring/init";
import "../src/style-entry";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
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
import { OnboardingProvider, useOnboarding } from "../src/onboarding/provider";
import { SessionProvider, useSession } from "../src/session/provider";
import { AnimatedSplash } from "../src/splash/animated-splash";
import { ThemeProvider } from "../src/theme/provider";

// The native splash stays up until the animated one has drawn the same first frame over it.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: false });

/** Plays the splash until we know where to send the user. */
function Splash() {
  const session = useSession();
  const onboarding = useOnboarding();
  return <AnimatedSplash ready={session.status !== "loading" && onboarding.status !== "loading"} />;
}

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
              <Splash />
            </OnboardingProvider>
          </DataProvider>
        </SessionProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
