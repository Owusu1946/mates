import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LiquidGlassButton } from "../components/ui/liquid-glass-button";
import { useTheme } from "../theme/provider";

export type FeedbackReason = "wrong_answer" | "didnt_follow_instructions" | "too_slow" | "too_long" | "other";

const reasons: { value: FeedbackReason; label: string }[] = [
  { value: "wrong_answer", label: "Wrong answer" },
  { value: "didnt_follow_instructions", label: "Didn't do what I asked" },
  { value: "too_slow", label: "Too slow" },
  { value: "too_long", label: "Too long" },
  { value: "other", label: "Other" },
];

export function FeedbackSheet({
  submitting,
  onClose,
  onSubmit,
}: {
  submitting: boolean;
  onClose: () => void;
  onSubmit: (reason: FeedbackReason, note: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [note, setNote] = useState("");

  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onClose}
      onDismiss={onClose}
    >
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: colors.background }}>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom, 16) + 24, gap: 20 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            <View style={{ gap: 4 }}>
              <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: "DMSans_700Bold", fontSize: 24 }}>
                What went wrong?
              </Text>
              <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 14 }}>
                Your feedback helps us improve replies.
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              {reasons.map((item) => {
                const selected = reason === item.value;
                return (
                  <Pressable
                    key={item.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setReason(item.value)}
                    style={{
                      minHeight: 48,
                      justifyContent: "center",
                      paddingHorizontal: 14,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.surface : "transparent",
                    }}
                  >
                    <Text style={{ color: colors.text, fontFamily: selected ? "DMSans_600SemiBold" : "DMSans_400Regular", fontSize: 14 }}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              accessibilityLabel="Optional feedback note"
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={colors.textMuted}
              maxLength={1_000}
              multiline
              textAlignVertical="top"
              style={{
                minHeight: 76,
                maxHeight: 120,
                padding: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.text,
                backgroundColor: colors.surface,
                fontFamily: "DMSans_400Regular",
                fontSize: 14,
              }}
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                disabled={submitting}
                style={{ minHeight: 52, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 16, borderWidth: 1, borderColor: colors.border, opacity: submitting ? 0.5 : 1 }}
              >
                <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <LiquidGlassButton
                accessibilityLabel={submitting ? "Sending feedback" : "Submit feedback"}
                size={52}
                pill
                tintColor={colors.text}
                disabled={!reason || submitting}
                onPress={() => reason && onSubmit(reason, note.trim())}
                style={{ flex: 1, opacity: !reason || submitting ? 0.5 : 1 }}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={{ color: colors.background, fontFamily: "DMSans_600SemiBold", fontSize: 15 }}>Submit</Text>
                )}
              </LiquidGlassButton>
            </View>
          </ScrollView>
      </View>
    </Modal>
  );
}
