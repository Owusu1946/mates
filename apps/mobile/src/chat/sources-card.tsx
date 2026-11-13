import { useAuth } from "@clerk/expo";
import { reportRead } from "../habits/report-reads";
import type { WorkflowCard } from "@expojet/api-contract";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import { ChatIcon } from "./chat-icon";

type Source = NonNullable<WorkflowCard["sources"]>[number];

/** A site's icon, or its first letter if the icon can't load. */
function Favicon({ source, size, ring }: { source: Source; size: number; ring?: string }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceElevated,
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
      }}
    >
      {failed ? (
        <Text style={{ color: colors.textMuted, fontSize: size * 0.45, fontFamily: "DMSans_600SemiBold" }}>{source.domain[0]?.toUpperCase()}</Text>
      ) : (
        <Image source={{ uri: source.favicon }} style={{ width: size * 0.62, height: size * 0.62 }} onError={() => setFailed(true)} />
      )}
    </View>
  );
}

const published = (date: string | null) =>
  date ? new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;

/**
 * The pages an answer drew on, the way ChatGPT shows them: a pill of site icons under the answer
 * that opens the full list. Each source opens in the in-app browser.
 */
export function SourcesCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const sources = state.sources ?? [];
  if (!sources.length) return null;
  const openSource = (source: Source) => {
    haptic.light();
    reportRead(getToken, { type: "link", ref: source.domain, label: source.title });
    void WebBrowser.openBrowserAsync(source.url);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${state.label}. Show sources`}
        onPress={() => {
          haptic.light();
          setOpen(true);
        }}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginTop: 4,
          marginBottom: 6,
          paddingLeft: 6,
          paddingRight: 12,
          height: 34,
          borderRadius: 17,
          backgroundColor: colors.surfaceElevated,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View style={{ flexDirection: "row" }}>
          {sources.slice(0, 4).map((source, index) => (
            <View key={source.id} style={{ marginLeft: index ? -7 : 0 }}>
              <Favicon source={source} size={22} ring={colors.surfaceElevated} />
            </View>
          ))}
        </View>
        <Text style={{ color: colors.text, fontSize: 13.5, fontFamily: "DMSans_600SemiBold" }}>{state.label}</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
            <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontFamily: "DMSans_700Bold" }}>
              Sources
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={() => setOpen(false)} style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceElevated }}>
              <ChatIcon name="close" color={colors.text} size={18} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}>
            {sources.map((source) => (
              <Pressable
                key={source.id}
                accessibilityRole="link"
                accessibilityLabel={`${source.title}, ${source.domain}`}
                onPress={() => openSource(source)}
                style={({ pressed }) => ({ flexDirection: "row", gap: 12, padding: 12, borderRadius: 16, backgroundColor: pressed ? colors.surfaceElevated : "transparent" })}
              >
                <Favicon source={source} size={32} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12.5 }}>
                    {source.domain}
                    {published(source.publishedAt) ? ` · ${published(source.publishedAt)}` : ""}
                  </Text>
                  <Text numberOfLines={2} style={{ color: colors.text, fontSize: 15.5, lineHeight: 21, fontFamily: "DMSans_500Medium" }}>
                    {source.title}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
