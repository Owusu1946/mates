import { useAuth } from "@clerk/expo";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, FlatList, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { AppLogo, ConnectionButton } from "../../src/connections/app-connection";
import { GitHubCard } from "../../src/connections/github-card";
import { SlackCard } from "../../src/connections/slack-card";
import { createApiClient } from "../../src/data/api";
import { useTheme } from "../../src/theme/provider";
import { ChatIcon } from "../../src/chat/chat-icon";
import type { AppConnection } from "@expojet/api-contract";

export default function ConnectionsScreen() {
  const { userId, getToken } = useAuth();
  const token = useRef(getToken); token.current = getToken;
  const api = useMemo(() => createApiClient(() => token.current()), []);
  const cache = useQueryClient();
  const { isDark } = useTheme();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  const apps = useInfiniteQuery({
    queryKey: ["connected-apps", userId, search, connectedOnly],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const response = await api.v1.apps.$get({ query: { ...(search ? { search } : {}), ...(pageParam ? { cursor: pageParam } : {}), ...(connectedOnly ? { connected: "true" } : {}) } });
      if (!response.ok) throw new Error("Couldn’t load apps. Pull down to try again.");
      return response.json();
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  useEffect(() => { const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void apps.refetch(); }); return () => subscription.remove(); }, [apps.refetch]);
  const background = isDark ? "#18181b" : "#fff";
  const foreground = isDark ? "#fafafa" : "#18181b";
  const muted = isDark ? "#a1a1aa" : "#71717a";
  const border = isDark ? "#3f3f46" : "#e4e4e7";
  const disconnect = (app: AppConnection) => Alert.alert(`Disconnect ${app.name}?`, "Your mates will need a new connection to use this app again.", [
    { text: "Cancel", style: "cancel" },
    { text: "Disconnect", style: "destructive", onPress: async () => {
      setDisconnecting(app.slug); setError(null);
      try {
        const response = await api.v1.apps[":slug"].$delete({ param: { slug: app.slug } });
        if (!response.ok) throw new Error("Couldn’t disconnect. Try again.");
        await cache.invalidateQueries({ queryKey: ["connected-apps", userId] });
        await cache.invalidateQueries({ queryKey: ["app-connection", userId, app.slug] });
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t disconnect."); }
      finally { setDisconnecting(null); }
    } },
  ]);
  return <>
    <Stack.Screen options={{ title: "Apps", headerLargeTitle: true, headerLargeTitleShadowVisible: false, headerSearchBarOptions: { placeholder: "Search apps", hideWhenScrolling: true, onChangeText: (event) => setQuery(event.nativeEvent.text), onCancelButtonPress: () => setQuery("") } }} />
    <FlatList
    style={{ flex: 1, backgroundColor: background }}
    contentInsetAdjustmentBehavior="automatic"
    keyboardShouldPersistTaps="handled"
    keyboardDismissMode="on-drag"
    showsVerticalScrollIndicator={false}
    contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 50, gap: 0 }}
    data={apps.data?.pages.flatMap((page) => page.apps) ?? []}
    keyExtractor={(app) => app.slug}
    refreshing={apps.isRefetching && !apps.isFetchingNextPage}
    onRefresh={() => void apps.refetch()}
    onEndReached={() => { if (apps.hasNextPage && !apps.isFetchingNextPage) void apps.fetchNextPage(); }}
    onEndReachedThreshold={.5}
    ListHeaderComponent={<View style={{ gap: 12, marginBottom: 12 }}>
      <GitHubCard isDark={isDark} />
      <SlackCard isDark={isDark} />
      {Platform.OS !== "ios" && <View style={{ flexDirection: "row", gap: 9, alignItems: "center", borderRadius: 14, paddingHorizontal: 12, backgroundColor: isDark ? "#27272a" : "#f4f4f5" }}>
        <ChatIcon name="search" color={muted} size={19} />
        <TextInput value={query} onChangeText={setQuery} autoCorrect={false} placeholder="Find an app" placeholderTextColor={muted} style={{ flex: 1, minHeight: 42, fontSize: 15, color: foreground, fontFamily: "DMSans_400Regular" }} />
      </View>}
      <View style={{ flexDirection: "row", padding: 3, borderRadius: 11, backgroundColor: isDark ? "#27272a" : "#f4f4f5" }}>{[false, true].map((connected) => <Pressable key={String(connected)} accessibilityRole="button" accessibilityState={{ selected: connectedOnly === connected }} onPress={() => setConnectedOnly(connected)} style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8, backgroundColor: connectedOnly === connected ? background : "transparent" }}><Text style={{ color: connectedOnly === connected ? foreground : muted, fontFamily: "DMSans_500Medium", fontSize: 13 }}>{connected ? "Connected" : "All apps"}</Text></Pressable>)}</View>
      {(error || apps.error) && <View style={{ gap: 8 }}><Text style={{ color: isDark ? "#fda4af" : "#be123c", fontSize: 14 }}>{error ?? apps.error?.message}</Text><Pressable accessibilityRole="button" onPress={() => void apps.refetch()}><Text style={{ color: foreground, fontWeight: "600" }}>Try again</Text></Pressable></View>}
    </View>}
    ListEmptyComponent={apps.isPending ? <ActivityIndicator style={{ marginTop: 35 }} color={muted} /> : !apps.error ? <View style={{ paddingVertical: 30, gap: 8 }}><Text style={{ color: foreground, fontSize: 17, fontFamily: "DMSans_600SemiBold" }}>{search ? "No apps found" : connectedOnly ? "Your connected apps will appear here" : "No apps available yet"}</Text><Text style={{ color: muted, fontSize: 14 }}>{search ? "Try a different app name." : "Browse All apps, or ask a mate to help with an app."}</Text></View> : null}
    ListFooterComponent={apps.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 20 }} color={muted} /> : null}
    renderItem={({ item: app }) => <View style={{ paddingVertical: 13, borderBottomWidth: .5, borderBottomColor: border, gap: 7 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <AppLogo name={app.name} logo={app.logo} size={38} />
        <View style={{ flex: 1, gap: 3 }}><Text style={{ color: foreground, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>{app.name}</Text><Text style={{ color: muted, fontSize: 12 }}>{app.noAuth ? "Ready to use" : app.connected ? "Connected" : "Not connected"}</Text></View>
        {app.connected && !app.noAuth && <Pressable disabled={disconnecting === app.slug} accessibilityRole="button" onPress={() => disconnect(app)} hitSlop={8}><Text style={{ color: muted, fontSize: 13 }}>{disconnecting === app.slug ? "Disconnecting…" : "Disconnect"}</Text></Pressable>}
        {!app.noAuth && !app.connected && <ConnectionButton app={app} label="Connect" compact />}
      </View>
    </View>}
    />
  </>;
}
