import type { WorkflowCard } from "@expojet/api-contract";
import { Image, Pressable, Text, View } from "react-native";
import { useState } from "react";
import { ChatIcon } from "./chat-icon";

export function ProductResult({ item, isDark, onOpen }: {
  item: NonNullable<WorkflowCard["items"]>[number];
  isDark: boolean;
  onOpen: () => void;
}) {
  const [failedImage, setFailedImage] = useState(false);
  const product = item.product!;
  const foreground = isDark ? "#fafafa" : "#18181b";
  const muted = isDark ? "#a1a1aa" : "#71717a";
  const body = { fontFamily: "DMSans_400Regular", fontSize: 14, lineHeight: 21, color: foreground };
  const date = new Date(product.observedAt);
  return (
    <View style={{ paddingVertical: 16, gap: 16, borderBottomWidth: 1, borderColor: isDark ? "#353538" : "#eeeeef" }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <View style={{ width: "36%", aspectRatio: 1.15, borderWidth: 1, borderColor: isDark ? "#353538" : "#eeeeef", borderRadius: 18, padding: 8, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {product.imageUrl && !failedImage ? (
            <Image source={{ uri: product.imageUrl }} resizeMode="contain" accessibilityLabel={item.title} style={{ width: "100%", height: "100%" }} onError={() => setFailedImage(true)} />
          ) : <Text style={{ ...body, fontSize: 12, color: "#71717a", textAlign: "center" }}>Image unavailable</Text>}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Pressable accessibilityRole="link" accessibilityLabel={`View ${item.title}`} disabled={!item.url} onPress={onOpen}>
            <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 18, lineHeight: 24, color: foreground, textDecorationLine: "underline" }}>{item.title}</Text>
          </Pressable>
          <Text selectable style={{ fontFamily: "DMSans_600SemiBold", fontSize: 25, lineHeight: 32, color: foreground }}>
            {product.price && product.currency ? `${product.currency === "GHS" ? "GH₵" : `${product.currency} `}${product.price}` : "Price unavailable"}
          </Text>
          {!!product.specs && <Text selectable style={body}>{product.specs}</Text>}
          <Text style={{ ...body, color: muted }}>Seller: {product.seller}</Text>
          <Text style={{ ...body, fontSize: 12, color: muted }}>{product.availability === "in_stock" ? "In stock" : product.availability === "out_of_stock" ? "Out of stock" : "Availability not confirmed"}</Text>
        </View>
      </View>
      {!Number.isNaN(date.getTime()) && <Text style={{ ...body, color: muted, fontSize: 12 }}>Listing checked {date.toLocaleDateString()} · {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>}
      <Pressable accessibilityRole="link" accessibilityLabel={`View on ${product.seller}`} disabled={!item.url} onPress={onOpen} style={({ pressed }) => ({ borderRadius: 28, minHeight: 50, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: isDark ? "#fafafa" : "#18181b", opacity: pressed ? 0.75 : 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 })}>
        <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 15, color: isDark ? "#18181b" : "#fff", flexShrink: 1 }}>View on {product.seller}</Text>
        <ChatIcon name="next" size={18} color={isDark ? "#18181b" : "#fff"} />
      </Pressable>
    </View>
  );
}
