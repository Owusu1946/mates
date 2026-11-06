import { useAuth } from "@clerk/expo";
import { useAuiState } from "@assistant-ui/react-native";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ChatIcon } from "./chat-icon";
import { attachmentUrl, localPreview } from "./attachments";

type Colors = { foreground: string; muted: string; mutedForeground: string; border: string };

/** Own uploads show from the device; everything else streams once, then lives in the disk cache. */
function useAttachmentSource(id: string | undefined) {
  const { getToken } = useAuth();
  const local = id ? localPreview(id) : undefined;
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!id || local) return;
    let cancelled = false;
    void getToken().then((value) => { if (!cancelled) setToken(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, local, getToken]);
  if (local) return { uri: local };
  const url = id ? attachmentUrl(id) : null;
  return url && token ? { uri: url, headers: { authorization: `Bearer ${token}` }, cacheKey: `attachment-${id}` } : null;
}

function AttachmentImage({ id, uri, size, radius }: { id?: string; uri?: string; size: number; radius: number }) {
  const remote = useAttachmentSource(uri ? undefined : id);
  const source = uri ? { uri } : remote;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: "hidden", backgroundColor: "rgba(127,127,127,0.15)" }}>
      {source && <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={120} />}
    </View>
  );
}

function FileLabel({ name, colors, maxWidth }: { name: string; colors: Colors; maxWidth: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth }}>
      <ChatIcon name="files" color={colors.foreground} size={16} />
      <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: "DMSans_500Medium", fontSize: 13, flexShrink: 1 }}>{name}</Text>
    </View>
  );
}

const CHIP = 56;

function fileKind(name: string) {
  const extension = name.split(".").pop();
  return extension && extension !== name ? extension.toUpperCase() : "File";
}

/** A composer chip: photo thumbnail or file card, with a spinner while it uploads. */
export function ComposerAttachmentChip({
  id, uri, name, image, uploading = false, onRemove, colors,
}: {
  id?: string;
  uri?: string;
  name: string;
  image: boolean;
  uploading?: boolean;
  onRemove?: () => void;
  colors: Colors;
}) {
  return (
    // Padding leaves room for the remove badge, which overhangs the corner.
    <View style={{ paddingTop: 6, paddingRight: 6 }}>
      <View
        accessibilityLabel={uploading ? `Uploading ${name}` : name}
        style={[
          { height: CHIP, borderRadius: 14, borderCurve: "continuous", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
          image
            ? { width: CHIP }
            : { width: 168, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, backgroundColor: colors.muted },
        ]}
      >
        {image ? (
          <AttachmentImage id={id} uri={uri} size={CHIP} radius={14} />
        ) : (
          <>
            <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.border }}>
              <ChatIcon name="files" color={colors.foreground} size={17} />
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: "DMSans_500Medium", fontSize: 13 }}>{name}</Text>
              <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontFamily: "DMSans_400Regular", fontSize: 12 }}>{fileKind(name)}</Text>
            </View>
          </>
        )}
        {uploading && (
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" }]}>
            <ActivityIndicator size="small" color="#ffffff" />
          </View>
        )}
      </View>
      {onRemove && !uploading && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name}`}
          hitSlop={8}
          onPress={onRemove}
          style={{ position: "absolute", top: 0, right: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.foreground, alignItems: "center", justifyContent: "center" }}
        >
          <ChatIcon name="close" color={colors.muted} size={11} />
        </Pressable>
      )}
    </View>
  );
}

/** Photos and files on a sent message, above its bubble. */
export function MessageAttachments({ colors }: { colors: Colors }) {
  const attachments = useAuiState((state) => state.message.attachments) ?? [];
  if (!attachments.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6, marginBottom: 6, maxWidth: "82%" }}>
      {attachments.map((attachment) =>
        attachment.type === "image" ? (
          <AttachmentImage key={attachment.id} id={attachment.id} size={attachments.length === 1 ? 180 : 110} radius={18} />
        ) : (
          <View
            key={attachment.id}
            style={{ paddingHorizontal: 12, height: 40, borderRadius: 14, justifyContent: "center", backgroundColor: colors.muted, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
          >
            <FileLabel name={attachment.name} colors={colors} maxWidth={220} />
          </View>
        ),
      )}
    </View>
  );
}
