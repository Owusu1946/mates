import { useAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppConnection } from "@expojet/api-contract";
import { useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { AppLogo } from "../../src/connections/app-connection";
import { createApiClient } from "../../src/data/api";
import { haptic } from "../../src/haptics";
import { usePullToRefresh } from "../../src/hooks/use-pull-to-refresh";
import { font, Group } from "../../src/memory/memory-ui";
import { useTheme } from "../../src/theme/provider";

type Grant = { id: string; category: string; toolkit: string; target: string; createdAt: string; lastUsedAt: string | null };

const VERB: Record<string, string> = { send: "Send messages", share: "Share and invite", delete: "Delete", change: "Make changes", draft: "Write drafts" };

function ago(iso: string | null) {
  if (!iso) return "Not used yet";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "Used today" : days === 1 ? "Used yesterday" : days < 30 ? `Used ${days} days ago` : `Used ${new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

/** What mates may do without asking, from "Always allow" on an approval card; each one removable. */
export default function PermissionsScreen() {
  const { getToken, userId } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const [error, setError] = useState<string | null>(null);
  const grants = useQuery({
    queryKey: ["permissions", userId],
    queryFn: async () => {
      const response = await api.v1.permissions.$get();
      if (!response.ok) throw new Error("Couldn’t load permissions.");
      return ((await response.json()) as unknown as { grants: Grant[] }).grants;
    },
  });
  // Names and logos for the apps the grants are for.
  const apps = useQuery({
    queryKey: ["connected-apps", userId, "permissions"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const response = await api.v1.apps.$get({ query: { connected: "true" } });
      if (!response.ok) return [] as AppConnection[];
      return ((await response.json()) as { apps: AppConnection[] }).apps;
    },
  });
  const pull = usePullToRefresh(() => grants.refetch());
  const appOf = (toolkit: string) => apps.data?.find((app) => app.slug === toolkit);

  const remove = (grant: Grant, title: string) =>
    Alert.alert("Remove this permission?", `${title}. Your mates will ask again next time.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          haptic.selection();
          setError(null);
          const response = await api.v1.permissions[":id"].$delete({ param: { id: grant.id } }).catch(() => null);
          if (!response?.ok) return setError("Couldn’t remove that. Try again.");
          await queryClient.invalidateQueries({ queryKey: ["permissions", userId] });
        },
      },
    ]);

  const list = grants.data ?? [];
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 56, gap: 20 }}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22 }}>
        Your mates always ask before spending money or deleting something for good, and before reaching anyone while you’re away. What you’ve always allowed is here.
      </Text>

      {error && <Text style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>{error}</Text>}
      {grants.isError && <Text style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>Couldn’t load permissions. Pull down to try again.</Text>}

      {grants.isSuccess && list.length === 0 && (
        <View style={{ alignItems: "center", gap: 8, paddingVertical: 40 }}>
          <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 16 }}>Nothing allowed yet</Text>
          <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 290 }}>
            When a mate asks first, tap Always allow and it shows up here.
          </Text>
        </View>
      )}

      {list.length > 0 && (
        <Group>
          {list.map((grant) => {
            const app = appOf(grant.toolkit);
            const appName = app?.name ?? grant.toolkit.charAt(0).toUpperCase() + grant.toolkit.slice(1);
            const verb = VERB[grant.category] ?? "Act";
            const title = `${verb}${grant.target ? ` to ${grant.target}` : ""} in ${appName}`;
            return (
              <View key={grant.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 14, paddingRight: 8, paddingVertical: 12 }}>
                <AppLogo name={appName} logo={app?.logo} size={32} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 15 }}>{verb}</Text>
                  <Text numberOfLines={1} style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13 }}>
                    {grant.target ? `${grant.target} · ` : ""}
                    {appName} · {ago(grant.lastUsedAt)}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove: ${title}`} hitSlop={8} onPress={() => remove(grant, title)} style={({ pressed }) => ({ paddingHorizontal: 8, paddingVertical: 6, opacity: pressed ? 0.5 : 1 })}>
                  <Text style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>Remove</Text>
                </Pressable>
              </View>
            );
          })}
        </Group>
      )}
    </ScrollView>
  );
}
