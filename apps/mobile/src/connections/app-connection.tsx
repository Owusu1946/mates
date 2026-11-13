import { useAuth } from "@clerk/expo";
import { CardButton } from "../chat/card-button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Image, Text, View } from "react-native";
import { SvgUri } from "react-native-svg";
import { createApiClient } from "../data/api";
import { useTheme } from "../theme/provider";
import type { AppConnection } from "@expojet/api-contract";
import { useToast } from "../components/toast";

WebBrowser.maybeCompleteAuthSession();

export function AppLogo({
  name,
  logo,
  size = 42,
}: {
  name: string;
  logo?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const [svgFailed, setSvgFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    setSvgFailed(false);
  }, [logo]);
  const { isDark } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
        backgroundColor: isDark ? "#27272a" : "#f4f4f5",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {logo &&
      !svgFailed &&
      !failed &&
      /logos\.composio\.dev|\.svg(?:\?|$)/i.test(logo) ? (
        <SvgUri
          uri={logo}
          width={size * 0.68}
          height={size * 0.68}
          onError={() => setSvgFailed(true)}
        />
      ) : logo && !failed ? (
        <Image
          source={{ uri: logo }}
          onError={() => setFailed(true)}
          style={{ width: size * 0.68, height: size * 0.68 }}
          resizeMode="contain"
        />
      ) : (
        <Text
          style={{
            fontFamily: "DMSans_600SemiBold",
            fontSize: size * 0.45,
            color: isDark ? "#fafafa" : "#18181b",
          }}
        >
          {name.charAt(0)}
        </Text>
      )}
    </View>
  );
}

export function ConnectionButton({
  app,
  onConnected,
  callbackPath = "/connections",
  label,
  disabled = false,
  compact = false,
}: {
  app: AppConnection;
  onConnected?: () => void;
  callbackPath?: string;
  label?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { getToken, userId } = useAuth();
  const token = useRef(getToken);
  token.current = getToken;
  const api = useMemo(() => createApiClient(() => token.current()), []);
  const { isDark } = useTheme();
  const cache = useQueryClient();
  const { show } = useToast();
  const [opening, setOpening] = useState(false);
  const [pending, setPending] = useState(false);
  const resumed = useRef(false);
  const callback = useRef(onConnected);
  callback.current = onConnected;
  const status = useQuery({
    queryKey: ["app-connection", userId, app.slug],
    initialData: app,
    queryFn: async () => {
      const response = await api.v1.apps[":slug"].$get({
        param: { slug: app.slug },
      });
      const data = await response.json();
      if (!response.ok || !("app" in data))
        throw new Error("Couldn’t check this connection. Try again.");
      return data.app;
    },
    refetchInterval: pending ? 3500 : false,
    refetchIntervalInBackground: false,
  });
  const connected = status.data.connected || status.data.noAuth;
  useEffect(() => {
    if (!pending || !connected || resumed.current) return;
    resumed.current = true;
    setPending(false);
    void cache.invalidateQueries({ queryKey: ["connected-apps", userId] });
    show({ message: `${app.name} connected.`, tone: "success" });
    callback.current?.();
  }, [connected, pending, cache, userId, app.name, show]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && pending) void status.refetch();
    });
    return () => subscription.remove();
  }, [pending, status.refetch]);
  useEffect(() => {
    if (
      pending &&
      ["FAILED", "EXPIRED", "REVOKED", "DISABLED"].includes(status.data.status)
    ) {
      setPending(false);
      show({ message: `Couldn’t connect ${app.name}.`, tone: "error" });
    }
  }, [pending, status.data.status, app.name, show]);
  const connect = async () => {
    if (opening || disabled) return;
    if (connected && callback.current) {
      callback.current();
      return;
    }
    setOpening(true);
    resumed.current = false;
    try {
      const callbackUrl = Linking.createURL(callbackPath);
      const response = await api.v1.apps[":slug"].connect.$post(
        { param: { slug: app.slug } },
        {
          init: { body: JSON.stringify({ callbackUrl }) },
          headers: { "content-type": "application/json" },
        },
      );
      const data = await response.json();
      if (!response.ok || !("connected" in data))
        throw new Error("Couldn’t start the connection. Try again.");
      setPending(true);
      let cancelled = false;
      if (!data.connected) {
        if (
          !data.connectUrl ||
          !/^https:\/\/connect\.composio\.(dev|ai)\//.test(data.connectUrl)
        )
          throw new Error("A secure connection link was not returned.");
        const authorization = await WebBrowser.openAuthSessionAsync(
          data.connectUrl,
          callbackUrl,
        );
        cancelled =
          authorization.type === "cancel" || authorization.type === "dismiss";
      }
      const refreshed = await status.refetch();
      if (cancelled && !refreshed.data?.connected && !refreshed.data?.noAuth) {
        setPending(false);
        // Dismissing the provider sheet is an intentional choice, not a failure.
      }
    } catch {
      show({ message: `Couldn’t connect ${app.name}.`, tone: "error" });
      setPending(false);
    } finally {
      setOpening(false);
    }
  };
  return (
    <View style={{ gap: 6, flexDirection: "column", alignItems: compact ? "flex-end" : "stretch" }}>
      <CardButton
        variant={compact ? "outlined" : "filled"}
        align={compact ? "end" : "start"}
        label={opening
              ? "Connecting…"
              : connected
                ? onConnected
                  ? "Continue task"
                  : "Connected"
                : pending
                  ? "Finish connecting"
                  : (label ?? `Connect ${app.name}`)}
        disabled={disabled || opening || (connected && !onConnected)}
        onPress={() => void connect()}
      />
      {status.error && (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontSize: 11,
            lineHeight: 15,
            color: isDark ? "#fda4af" : "#be123c",
            ...(compact ? { width: 170, textAlign: "right" as const } : {}),
          }}
        >
        Can’t check connection. Try again.
        </Text>
      )}
      {pending && !opening && (
        <Text style={{ fontSize: 12, color: isDark ? "#a1a1aa" : "#71717a" }}>
          Waiting for authorization. Return here when you’re done.
        </Text>
      )}
    </View>
  );
}
