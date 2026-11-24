import type { WorkflowCard } from "@expojet/api-contract";
import { useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme/provider";
import { emailPreview, emailSubtitle } from "./email-preview";

type Item = NonNullable<WorkflowCard["items"]>[number];

export function EmailResults({ items }: { items: Item[] }) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [error, setError] = useState("");
  const visible = expanded ? items : items.slice(0, 3);
  const body = {
    color: colors.textSecondary,
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 21,
  } as const;
  const close = () => {
    setSelected(null);
    setError("");
  };
  const gmailUrl = selected?.url?.startsWith("https://")
    ? selected.url
    : selected && /^[a-f0-9]{10,30}$/i.test(selected.sourceId)
      ? `https://mail.google.com/mail/#all/${encodeURIComponent(selected.sourceId)}`
      : null;
  const openGmail = () => {
    if (!gmailUrl) return;
    void Linking.openURL(gmailUrl).catch(() => {
      setError("Couldn’t open Gmail. Please try again.");
    });
  };

  return (
    <View>
      {visible.map((item, index) => (
        <Pressable
          key={item.sourceId + index}
          accessibilityRole="button"
          accessibilityLabel={emailPreview(item.title)}
          accessibilityHint="Opens the email preview"
          onPress={() => setSelected(item)}
          style={({ pressed }) => ({
            paddingVertical: 15,
            borderBottomWidth: 1,
            borderColor: colors.border,
            gap: 5,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          {!!item.subtitle && (
            <Text numberOfLines={1} style={[body, { fontSize: 12 }]}>
              {emailSubtitle(item.subtitle)}
            </Text>
          )}
          <Text
            numberOfLines={2}
            style={{
              color: colors.text,
              fontFamily: "DMSans_600SemiBold",
              fontSize: 15,
              lineHeight: 21,
            }}
          >
            {emailPreview(item.title)}
          </Text>
          <Text numberOfLines={2} style={body}>
            {emailPreview(item.preview) || "Open to view details."}
          </Text>
        </Pressable>
      ))}
      {items.length > 3 && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          style={{ paddingVertical: 14 }}
        >
          <Text style={body}>{expanded ? "Show fewer" : `Show all ${items.length}`}</Text>
        </Pressable>
      )}
      <Modal
        visible={!!selected}
        animationType={reducedMotion ? "none" : "slide"}
        presentationStyle="pageSheet"
        onRequestClose={close}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{
            paddingHorizontal: 24,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <Text style={body}>Email preview</Text>
            <Pressable
              accessibilityRole="button"
              onPress={close}
              style={{ padding: 12 }}
            >
              <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold" }}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 18 }}>
            <Text style={body}>{emailSubtitle(selected?.subtitle)}</Text>
            <Text
              selectable
              style={{
                color: colors.text,
                fontFamily: "DMSans_600SemiBold",
                fontSize: 22,
                lineHeight: 29,
              }}
            >
              {emailPreview(selected?.title)}
            </Text>
            <Text selectable style={body}>
              {emailPreview(selected?.preview) || "No readable preview is available."}
            </Text>
            <Text style={[body, { fontSize: 12 }]}>
              This preview may be shortened. Open Gmail for the full message.
            </Text>
            {gmailUrl && (
              <Pressable
                accessibilityRole="link"
                onPress={openGmail}
                style={{ paddingVertical: 14 }}
              >
                <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold" }}>
                  Open in Gmail ↗
                </Text>
              </Pressable>
            )}
            {!!error && <Text accessibilityRole="alert" style={{ color: colors.error }}>{error}</Text>}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
