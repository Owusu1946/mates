import { useAui, useAuiState } from "@assistant-ui/react-native";
import { Button, Host } from "@expo/ui";
import type { WorkflowCard } from "@expojet/api-contract";
import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AppLogo } from "../connections/app-connection";
import { useTheme } from "../theme/provider";
import { ChatIcon } from "./chat-icon";
import { ProductResult } from "./product-result";

export function AppResponseCard({ state }: { state: WorkflowCard }) {
  const { isDark } = useTheme();
  const aui = useAui();
  const running = useAuiState((s) => s.thread.isRunning);
  const [choice, setChoice] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const submitted = useRef(false);
  useEffect(() => {
    if (!choice || running || submitted.current || !state.resumeRunId) return;
    submitted.current = true;
    aui.message.reload({
      runConfig: { custom: { resumeRunId: state.resumeRunId, choice } },
    });
  }, [choice, running, state.resumeRunId, aui]);
  const foreground = isDark ? "#fafafa" : "#18181b";
  const muted = isDark ? "#a1a1aa" : "#71717a";
  const border = isDark ? "#353538" : "#e9e9ec";
  const text = {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 20,
    color: muted,
  };
  return (
    <View style={{ width: "100%", gap: 12, marginVertical: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {state.name && (
          <AppLogo name={state.name} logo={state.logo} size={28} />
        )}
        <Text
          style={{
            flex: 1,
            fontFamily: "DMSans_600SemiBold",
            fontSize: 17,
            color: foreground,
          }}
        >
          {state.label}
        </Text>
      </View>
      {!!state.detail && <Text style={text}>{state.detail}</Text>}
      {state.kind === "choice" ? (
        state.options?.map((option) => (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityLabel={`Use ${option.label}`}
            disabled={running || !!choice}
            onPress={() => setChoice(option.id)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 16,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: border,
              backgroundColor: pressed
                ? isDark
                  ? "#303034"
                  : "#f4f4f5"
                : isDark
                  ? "#232326"
                  : "#fafafa",
              opacity: choice && choice !== option.id ? 0.5 : 1,
            })}
          >
            <AppLogo name={option.label} logo={option.logo} size={36} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text
                style={{
                  fontFamily: "DMSans_600SemiBold",
                  fontSize: 15,
                  color: foreground,
                }}
              >
                {option.label}
              </Text>
              <Text style={text}>
                {choice === option.id
                  ? "Continuing your request…"
                  : option.detail}
              </Text>
            </View>
            <ChatIcon
              name={choice === option.id ? "check" : "next"}
              size={18}
              color={muted}
            />
          </Pressable>
        ))
      ) : (
        <>
          {!state.items?.length && (
            <View
              style={{
                padding: 18,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: border,
                gap: 5,
              }}
            >
              <Text
                style={{
                  fontFamily: "DMSans_600SemiBold",
                  fontSize: 15,
                  color: foreground,
                }}
              >
                Nothing found
              </Text>
              <Text style={text}>
                Try a different date range or a broader search.
              </Text>
            </View>
          )}
          {state.items?.map((item, index) => (
            item.product ? <ProductResult key={`${item.sourceId}_${index}`} item={item} isDark={isDark} onOpen={() => {
              if (item.url?.startsWith("https://")) void Linking.openURL(item.url).catch(() => setLinkError("Couldn’t open the listing. Please try again."));
            }} /> :
            <View
              key={`${item.sourceId}_${index}`}
              style={{
                padding: 16,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: border,
                backgroundColor: isDark ? "#232326" : "#fafafa",
                gap: 8,
              }}
            >
              {!!item.subtitle && (
                <Text style={{ ...text, fontSize: 12 }}>{item.subtitle}</Text>
              )}
              <Text
                selectable
                style={{
                  fontFamily: "DMSans_600SemiBold",
                  fontSize: 16,
                  lineHeight: 22,
                  color: foreground,
                }}
              >
                {item.title}
              </Text>
              {!!item.preview && (
                <Text selectable style={{ ...text, color: foreground }}>
                  {item.preview}
                </Text>
              )}
              {!!item.metrics?.length && (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
                >
                  {item.metrics.map((metric) => (
                    <Text key={metric} style={{ ...text, fontSize: 12 }}>
                      {metric}
                    </Text>
                  ))}
                </View>
              )}
              {item.url && (
                <Host matchContents colorScheme={isDark ? "dark" : "light"}>
                  <Button
                    variant="text"
                    label={
                      state.toolkit === "gmail"
                        ? "Open email"
                        : ["twitter", "x"].includes(state.toolkit ?? "")
                          ? "View post"
                          : state.toolkit === "web" ? "View source" : "Open in app"
                    }
                    onPress={() => {
                      if (item.url?.startsWith("https://"))
                        void Linking.openURL(item.url).catch(() =>
                          setLinkError(
                            "Couldn’t open the link. Please try again.",
                          ),
                        );
                    }}
                  />
                </Host>
              )}
            </View>
          ))}
          {linkError && (
            <Text style={{ ...text, color: isDark ? "#fda4af" : "#be123c" }}>
              {linkError}
            </Text>
          )}
          {!!state.followUps?.length && (
            <View style={{ gap: 8, marginTop: 2 }}>
              <Text style={{ ...text, fontSize: 12 }}>What next?</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {state.followUps.map((action) => (
                  <Pressable
                    key={action.label}
                    accessibilityRole="button"
                    disabled={running}
                    onPress={() => aui.composer.setText(action.prompt)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 13,
                      paddingVertical: 10,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: border,
                      backgroundColor: pressed
                        ? isDark
                          ? "#303034"
                          : "#f4f4f5"
                        : "transparent",
                      opacity: running ? 0.5 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontFamily: "DMSans_500Medium",
                        fontSize: 13,
                        color: foreground,
                      }}
                    >
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}
