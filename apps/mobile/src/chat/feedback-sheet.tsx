import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type FeedbackReason = "wrong_answer" | "didnt_follow_instructions" | "too_slow" | "too_long" | "other";
type FeedbackColors = { background: string; foreground: string; muted: string; mutedForeground: string; border: string; primary: string; primaryForeground: string };

const reasons: { value: FeedbackReason; label: string }[] = [
  { value: "wrong_answer", label: "Wrong answer" },
  { value: "didnt_follow_instructions", label: "Didn't do what I asked" },
  { value: "too_slow", label: "Too slow" },
  { value: "too_long", label: "Too long" },
  { value: "other", label: "Other" },
];

export function FeedbackSheet({
  visible,
  submitting,
  colors,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  submitting: boolean;
  colors: FeedbackColors;
  onClose: () => void;
  onSubmit: (reason: FeedbackReason, note: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (visible) {
      setReason(null);
      setNote("");
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close feedback sheet" onPress={onClose} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.38)" }} />
      <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <View accessibilityViewIsModal style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 16, gap: 14, backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderCurve: "continuous" }}>
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.foreground, fontFamily: "DMSans_600SemiBold", fontSize: 18 }}>What went wrong?</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: "DMSans_400Regular", fontSize: 14 }}>Your feedback helps us improve replies.</Text>
          </View>
          <View style={{ gap: 8 }}>
            {reasons.map((item) => {
              const selected = reason === item.value;
              return (
                <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setReason(item.value)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.muted : "transparent" }}>
                  <Text style={{ color: colors.foreground, fontFamily: selected ? "DMSans_600SemiBold" : "DMSans_400Regular", fontSize: 14 }}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            accessibilityLabel="Optional feedback note"
            value={note}
            onChangeText={setNote}
            placeholder="Add a note (optional)"
            placeholderTextColor={colors.mutedForeground}
            maxLength={1_000}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 76, maxHeight: 120, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted, fontFamily: "DMSans_400Regular", fontSize: 14 }}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable accessibilityRole="button" onPress={onClose} disabled={submitting} style={{ flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.foreground, fontFamily: "DMSans_600SemiBold", fontSize: 14 }}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !reason || submitting }} onPress={() => reason && onSubmit(reason, note.trim())} disabled={!reason || submitting} style={{ flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.primary, opacity: !reason || submitting ? 0.5 : 1 }}>
              <Text style={{ color: colors.primaryForeground, fontFamily: "DMSans_600SemiBold", fontSize: 14 }}>{submitting ? "Sending…" : "Submit"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
