import { useAuth } from "@clerk/expo";
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import { clearSharedPayloads, getResolvedSharedPayloadsAsync, getSharedPayloads } from "expo-sharing";
import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { MAX_ATTACHMENT_BYTES, prepareImage } from "../../src/chat/attachments";
import { useMates } from "../../src/mates/data";
import {
  discardAndroidPendingShare,
  readAndroidLastMate,
  readAndroidPendingShare,
  saveAndroidPendingShare,
  sendAndroidPendingShare,
} from "../../src/share/android-pending";
import type { PendingShare } from "../../src/share/pending";
import { useTheme } from "../../src/theme/provider";

function sharedUrl(value: string) {
  const candidate = value.trim().match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),.;!?]+$/, "");
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeFileName(value: string | null, contentType: string) {
  const fallback = contentType === "application/pdf" ? "shared.pdf" : "shared-image";
  const name = (value?.split(/[\\/]/).at(-1) ?? fallback).replace(/[^\w.-]+/g, "_").slice(-100);
  return name || fallback;
}

export default function ShareReceiveScreen() {
  const { userId, getToken } = useAuth();
  const matesQuery = useMates();
  const mates = matesQuery.data?.mates ?? [];
  const { colors } = useTheme();
  const [share, setShare] = useState<PendingShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processed = useRef(false);

  useEffect(() => {
    if (!userId || matesQuery.isLoading || processed.current) return;
    processed.current = true;
    void (async () => {
      const pending = await readAndroidPendingShare(userId);
      if (pending) {
        setShare(pending);
        setLoading(false);
        return;
      }
      const payloads = getSharedPayloads();
      if (!payloads.length) {
        setLoading(false);
        return;
      }
      if (payloads.length !== 1) {
        clearSharedPayloads();
        setError("Share one link, photo, or PDF at a time.");
        setLoading(false);
        return;
      }

      let stagedFile: File | null = null;
      let temporaryImage: File | null = null;
      try {
        const payload = payloads[0];
        let link: string | null = null;
        let filePath: string | null = null;
        let fileName: string | null = null;
        let contentType: string | null = null;
        if (payload.shareType === "url" || payload.shareType === "text") {
          link = sharedUrl(payload.value);
          if (!link) throw new Error("Share a web link, photo, or PDF to Mates.");
        } else {
          const resolved = await getResolvedSharedPayloadsAsync();
          const candidates = resolved.filter((item) => item.contentUri && (
            item.contentMimeType?.startsWith("image/") || item.contentMimeType === "application/pdf"
          ));
          const unique = [...new Map(candidates.map((item) => [item.contentUri, item])).values()];
          if (unique.length !== 1) throw new Error("Mates accepts one photo or PDF at a time.");
          const item = unique[0];
          if (!item.contentUri) throw new Error("Couldn’t read that file. Share it again from the other app.");
          contentType = item.contentMimeType ?? payload.mimeType ?? null;
          if (!contentType || (!contentType.startsWith("image/") && contentType !== "application/pdf")) {
            throw new Error("Mates accepts links, photos, and PDFs.");
          }
          const id = Crypto.randomUUID();
          fileName = safeFileName(item.originalName, contentType);
          stagedFile = new File(Paths.document, `${id}-${fileName}`);
          await new File(item.contentUri).copy(stagedFile);
          const size = Math.max(item.contentSize ?? 0, stagedFile.size ?? 0);
          if (size > MAX_ATTACHMENT_BYTES) {
            stagedFile.delete();
            stagedFile = null;
            throw new Error("Files must be 4 MB or smaller.");
          }
          if (contentType.startsWith("image/")) {
            const prepared = await prepareImage(stagedFile.uri);
            temporaryImage = new File(prepared.uri);
            const normalized = new File(Paths.document, `${Crypto.randomUUID()}-${prepared.name}`);
            await temporaryImage.copy(normalized);
            temporaryImage.delete();
            temporaryImage = null;
            stagedFile.delete();
            stagedFile = normalized;
            fileName = prepared.name;
            contentType = "image/jpeg";
            if ((stagedFile.size ?? 0) > MAX_ATTACHMENT_BYTES) {
              stagedFile.delete();
              stagedFile = null;
              throw new Error("Files must be 4 MB or smaller.");
            }
          }
          filePath = stagedFile.uri;
        }

        const lastMateId = await readAndroidLastMate(userId);
        const selectedMate = mates.find((mate) => mate.id === lastMateId) ?? mates[0];
        if (!selectedMate) throw new Error("Add a mate before sharing something with Mates.");
        const next: PendingShare = {
          id: Crypto.randomUUID(),
          userId,
          mateId: selectedMate.id,
          chatId: selectedMate.chatId,
          note: "",
          link,
          filePath,
          fileName,
          contentType,
          uploadedId: null,
        };
        await saveAndroidPendingShare(next);
        setShare(next);
        clearSharedPayloads();
      } catch (cause) {
        if (stagedFile?.exists) stagedFile.delete();
        if (temporaryImage?.exists) temporaryImage.delete();
        clearSharedPayloads();
        setError(cause instanceof Error ? cause.message : "Couldn’t read this share. Try again from the other app.");
      } finally {
        setLoading(false);
      }
    })();
  }, [mates, matesQuery.isLoading, userId]);

  const updateShare = (update: Partial<PendingShare>) => {
    if (!share) return;
    const next = { ...share, ...update };
    setShare(next);
  };

  const send = async () => {
    if (!share || sending || !share.mateId) return;
    setSending(true);
    setError(null);
    const locked = { ...share, note: share.note.trim(), locked: true };
    setShare(locked);
    try {
      await saveAndroidPendingShare(locked);
      const chatId = await sendAndroidPendingShare(locked, getToken);
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
    Alert.alert("Discard this share?", "The link or file will be removed from this device.", [
      { text: "Keep", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => {
        void discardAndroidPendingShare(share);
        clearSharedPayloads();
        setShare(null);
        router.back();
      } },
    ]);
  };

  const selectedMate = mates.find((mate) => mate.id === share?.mateId);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>Share to a mate</Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : share ? <>
        <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Choose who to send this to.</Text>
        <View style={{ gap: 8 }}>
          {mates.map((mate) => {
            const selected = mate.id === share.mateId;
            return <Pressable
              key={mate.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !!share.locked }}
              disabled={!!share.locked}
              onPress={() => updateShare({ mateId: mate.id, chatId: mate.chatId })}
              style={{ padding: 14, borderRadius: 14, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.surface, opacity: share.locked ? 0.75 : 1 }}
            ><Text style={{ color: colors.text, fontSize: 16, fontWeight: selected ? "700" : "500" }}>{mate.name}{selected ? "  ✓" : ""}</Text></Pressable>;
          })}
        </View>
        <View style={{ padding: 16, borderRadius: 16, backgroundColor: colors.surface, gap: 10 }}>
          {!!share.link && <Text selectable style={{ color: colors.textSecondary, fontSize: 14 }}>{share.link}</Text>}
          {!!share.fileName && <Text style={{ color: colors.text, fontSize: 15 }}>{share.fileName}</Text>}
        </View>
        <TextInput
          accessibilityLabel="Note to your mate"
          editable={!share.locked}
          value={share.note}
          onChangeText={(note) => updateShare({ note })}
          placeholder="Add a note"
          placeholderTextColor={colors.textMuted}
          maxLength={8000}
          multiline
          textAlignVertical="top"
          style={{ minHeight: 96, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }}
        />
        {!!error && <Text selectable accessibilityRole="alert" style={{ color: colors.error, fontSize: 14 }}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={sending || (!selectedMate && !share.locked)} onPress={() => void send()} style={{ backgroundColor: colors.primary, padding: 15, borderRadius: 14, opacity: sending || (!selectedMate && !share.locked) ? 0.6 : 1 }}>
          <Text style={{ color: colors.primaryForeground, textAlign: "center", fontWeight: "700" }}>{sending ? "Sending…" : "Send"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={sending} onPress={discard} style={{ padding: 12 }}>
          <Text style={{ color: colors.textSecondary, textAlign: "center" }}>Discard share</Text>
        </Pressable>
      </> : <>
        <Text selectable style={{ color: error ? colors.error : colors.textSecondary, fontSize: 15 }}>{error ?? "There’s no share waiting to send."}</Text>
        {!error && matesQuery.isError && <Pressable onPress={() => void matesQuery.refetch()}><Text style={{ color: colors.primary }}>Try loading mates again</Text></Pressable>}
      </>}
    </ScrollView>
  );
}
