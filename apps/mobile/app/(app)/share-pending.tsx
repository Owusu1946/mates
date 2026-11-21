import { useAuth } from "@clerk/expo";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useMates } from "../../src/mates/data";
import { canRetryPendingShare, discardPendingShare, readPendingShare, sendPendingShare } from "../../src/share/pending";
import { useTheme } from "../../src/theme/provider";

export default function PendingShareScreen() {
  const { userId, getToken } = useAuth();
  const [share, setShare] = useState(() => readPendingShare(userId ?? ""));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const mate = useMates().data?.mates.find((item) => item.id === share?.mateId);
  const retryReady = !!share && canRetryPendingShare(share);

  useEffect(() => {
    if (!share || retryReady) return;
    const timer = setInterval(() => {
      const current = readPendingShare(userId ?? "");
      if (!current || current.id !== share.id) setShare(null);
      else if (current.state !== share.state || current.uploadedId !== share.uploadedId || canRetryPendingShare(current)) setShare(current);
    }, 2000);
    return () => clearInterval(timer);
  }, [retryReady, share, userId]);

  const retry = async () => {
    if (!share || sending || !retryReady) return;
    setSending(true);
    setError(null);
    try {
      const chatId = await sendPendingShare(share, getToken);
      setShare(null);
      router.dismissTo({ pathname: "/(app)", params: { notificationChatId: chatId } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t send this share. Try again.");
    } finally {
      setSending(false);
    }
  };

  const discard = () => {
    if (!share) return router.back();
    if (!retryReady) return;
    Alert.alert("Discard this share?", "The link or file will be removed from this device.", [
      { text: "Keep", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => {
        discardPendingShare(share);
        setShare(null);
        router.back();
      } },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, gap: 18 }}>
      {share ? (
        <>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>Finish sharing</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 15 }}>
            To {mate?.name ?? "your mate"}
          </Text>
          <View style={{ padding: 16, borderRadius: 16, backgroundColor: colors.surface, gap: 10 }}>
            {!!share.note && <Text style={{ color: colors.text, fontSize: 16 }}>{share.note}</Text>}
            {!!share.link && <Text selectable style={{ color: colors.textSecondary, fontSize: 14 }}>{share.link}</Text>}
            {!!share.fileName && <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{share.fileName}</Text>}
          </View>
          {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 14 }}>{error}</Text>}
          {!retryReady && <Text style={{ color: colors.textSecondary }}>The share extension is still sending this item. This screen will update when it finishes.</Text>}
          <Pressable
            accessibilityRole="button"
            disabled={sending || !retryReady}
            onPress={() => void retry()}
            style={{ backgroundColor: colors.text, padding: 15, borderRadius: 14, opacity: sending || !retryReady ? 0.6 : 1 }}
          >
            <Text style={{ color: colors.background, textAlign: "center", fontWeight: "700" }}>{sending ? "Sending…" : "Send to mate"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={!retryReady} onPress={discard} style={{ padding: 12 }}>
            <Text style={{ color: colors.textSecondary, textAlign: "center" }}>Discard share</Text>
          </Pressable>
        </>
      ) : (
        <Text style={{ color: colors.textSecondary }}>There’s no share waiting to send.</Text>
      )}
    </ScrollView>
  );
}
