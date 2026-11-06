import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthAction } from "../../src/components/auth/auth-action";
import { PolygonAvatar } from "../../src/components/polygon-avatar/polygon-avatar";
import { DEFAULT_GRADIENT, type PolygonState } from "../../src/components/polygon-avatar/polygon-avatar-core";
import { haptic } from "../../src/haptics";
import { Glow } from "../../src/onboarding/glow";
import { useOnboarding } from "../../src/onboarding/provider";
import { useSession } from "../../src/session/provider";
import { authLayout, useAuthTheme } from "../../src/theme/auth";

type Gradient = [string, string, string];
// The mate palette (apps/api/src/mates.ts), so the crew here looks like the mates people create.
const TEAL: Gradient = ["#9fd8d1", "#3a9c94", "#155e63"];
const BLUE: Gradient = ["#b9c8f5", "#5b7be0", "#26408b"];
const ROSE: Gradient = ["#f6c1c7", "#e0607a", "#8f1d3a"];

type Page = { title: string; body: string; glow: string; cast: { gradient: Gradient; state: PolygonState; size: number; x: number; y: number }[] };
const PAGES: Page[] = [
  {
    title: "Meet Cooper",
    body: "The AI that remembers you, plans with you, and gets things done.",
    glow: DEFAULT_GRADIENT[1],
    cast: [{ gradient: DEFAULT_GRADIENT, state: "happy", size: 200, x: 0, y: 0 }],
  },
  {
    title: "Build your crew",
    body: "Create mates for research, money or plans, and team them up.",
    glow: TEAL[1],
    cast: [
      { gradient: BLUE, state: "curious", size: 104, x: -96, y: 34 },
      { gradient: ROSE, state: "excited", size: 104, x: 96, y: 34 },
      { gradient: TEAL, state: "happy", size: 150, x: 0, y: -18 },
    ],
  },
  {
    title: "Just ask",
    body: "Emails, meetings, reminders and files. Handled while you get on with your day.",
    glow: BLUE[1],
    cast: [{ gradient: BLUE, state: "working", size: 200, x: 0, y: 0 }],
  },
];
const HERO = 280;

/** Slow vertical drift so a page never sits completely still. */
function useFloat(delay: number) {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const timer = setTimeout(() => y.set(withRepeat(withSequence(withTiming(-7, { duration: 1900 }), withTiming(0, { duration: 1900 })), -1)), delay);
    return () => clearTimeout(timer);
  }, [delay, reduced, y]);
  return useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
}

function CastMember({ member, index, active }: { member: Page["cast"][number]; index: number; active: boolean }) {
  const float = useFloat(index * 500);
  return (
    <Animated.View style={[{ position: "absolute", left: HERO / 2 - member.size / 2 + member.x, top: HERO / 2 - member.size / 2 + member.y }, float]}>
      {/* Off-screen pages hold still: three live avatars at once is wasted work. */}
      <PolygonAvatar size={member.size} state={member.state} gradient={member.gradient} paused={!active} frameRate={member.size >= 150 ? 60 : 30} title={null} />
    </Animated.View>
  );
}

function PageView({ page, index, width, scroll, active }: { page: Page; index: number; width: number; scroll: SharedValue<number>; active: boolean }) {
  const { colors, isDark } = useAuthTheme();
  const range = [(index - 1) * width, index * width, (index + 1) * width];
  // The hero drifts slower than the page and the copy trails it, for a little depth.
  const hero = useAnimatedStyle(() => ({
    opacity: interpolate(scroll.get(), range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(scroll.get(), range, [width * 0.45, 0, -width * 0.45], Extrapolation.CLAMP) },
      { scale: interpolate(scroll.get(), range, [0.82, 1, 0.82], Extrapolation.CLAMP) },
    ],
  }));
  const copy = useAnimatedStyle(() => ({
    opacity: interpolate(scroll.get(), range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(scroll.get(), range, [width * 0.2, 0, -width * 0.2], Extrapolation.CLAMP) }],
  }));
  return (
    <View accessible accessibilityLabel={`${page.title}. ${page.body}`} style={{ width, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: authLayout.edge, gap: 40 }}>
      <Animated.View style={[{ width: HERO, height: HERO, alignItems: "center", justifyContent: "center" }, hero]}>
        <Glow color={page.glow} size={HERO * 1.5} opacity={isDark ? 0.4 : 0.5} style={{ left: -HERO * 0.25, top: -HERO * 0.25 }} />
        {page.cast.map((member, i) => <CastMember key={i} member={member} index={i} active={active} />)}
      </Animated.View>
      <Animated.View style={[{ gap: 12, alignItems: "center", maxWidth: 330 }, copy]}>
        <Text style={{ fontSize: authLayout.titleSize, lineHeight: 46, letterSpacing: -1.5, fontWeight: "600", color: colors.text, textAlign: "center" }}>{page.title}</Text>
        <Text style={{ fontSize: 17, lineHeight: 25, color: colors.secondary, textAlign: "center" }}>{page.body}</Text>
      </Animated.View>
    </View>
  );
}

function Dot({ index, width, scroll }: { index: number; width: number; scroll: SharedValue<number> }) {
  const { colors } = useAuthTheme();
  const style = useAnimatedStyle(() => {
    const distance = Math.min(1, Math.abs(scroll.get() / width - index));
    return { width: interpolate(distance, [0, 1], [24, 7]), opacity: interpolate(distance, [0, 1], [1, 0.25]) };
  });
  return <Animated.View style={[{ height: 7, borderRadius: 4, backgroundColor: colors.text }, style]} />;
}

/** First run: three swipeable pages, then sign-in. Shown once, before an account exists. */
export default function OnboardingScreen() {
  const onboarding = useOnboarding();
  const session = useSession();
  const { colors } = useAuthTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroll = useSharedValue(0);
  const list = useRef<Animated.ScrollView>(null);
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState(false);
  const last = page === PAGES.length - 1;

  const settle = (next: number) => {
    if (next === page) return;
    haptic.selection();
    setPage(next);
  };
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => scroll.set(event.contentOffset.x),
    onMomentumEnd: (event) => runOnJS(settle)(Math.round(event.contentOffset.x / width)),
  });

  // Saving can fail (secure storage); onboarding is a courtesy, so move on regardless.
  const finish = async () => {
    if (pending) return;
    setPending(true);
    await onboarding.finish().catch(() => undefined);
    // An explicit destination: "/" also matches this group's own index and would restart the intro.
    router.replace(session.status === "authenticated" ? "/(app)" : "/(public)/sign-in");
  };
  const next = () => {
    if (last) return void finish();
    list.current?.scrollTo({ x: (page + 1) * width, animated: true });
    settle(page + 1);
  };

  return (
    <View testID="onboarding" style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + authLayout.gap }}>
      <View style={{ height: 48, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingHorizontal: authLayout.edge }}>
        {!last && (
          <Pressable accessibilityRole="button" accessibilityLabel="Skip introduction" hitSlop={12} onPress={() => void finish()}>
            <Text style={{ fontSize: 16, fontWeight: "500", color: colors.secondary }}>Skip</Text>
          </Pressable>
        )}
      </View>
      <Animated.ScrollView
        ref={list}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {PAGES.map((item, index) => (
          <PageView key={item.title} page={item} index={index} width={width} scroll={scroll} active={index === page} />
        ))}
      </Animated.ScrollView>
      <View style={{ width: "100%", maxWidth: authLayout.maxWidth, alignSelf: "center", paddingHorizontal: authLayout.edge, gap: 28 }}>
        <View accessibilityRole="progressbar" accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`} style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
          {PAGES.map((item, index) => <Dot key={item.title} index={index} width={width} scroll={scroll} />)}
        </View>
        <AuthAction testID="onboarding-next" title={last ? "Get started" : "Continue"} loading={pending} onPress={next} />
      </View>
    </View>
  );
}
