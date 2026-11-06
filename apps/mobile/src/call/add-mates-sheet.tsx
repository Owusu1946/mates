import { Text, View } from "react-native";
import BottomSheet, { BottomSheetView } from "@expo/ui/community/bottom-sheet";
import { type BotMate, type CallMember } from "./call-model";
import { font, GlassIconButton, GlassPillButton, MateAvatar, useCallColors } from "./call-ui";

/** Native sheet: SwiftUI sheet on iOS, Material 3 ModalBottomSheet on Android. */
export function AddMatesSheet({
  visible, available, members, onInvite, onRemove, onClose,
}: {
  visible: boolean;
  available: BotMate[];
  members: CallMember[];
  onInvite: (mate: BotMate) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const colors = useCallColors();
  return (
    <BottomSheet
      index={visible ? 0 : -1}
      enablePanDownToClose
      enableDynamicSizing
      onClose={onClose}
      backgroundStyle={{ backgroundColor: colors.background }}
    >
      <BottomSheetView style={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 28, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontFamily: font.semibold, fontSize: 20 }}>Bring in bot mates</Text>
          <GlassIconButton icon="close" label="Close" size={34} onPress={onClose} />
        </View>
        <Text style={{ color: colors.mutedForeground, fontFamily: font.regular, fontSize: 14, marginBottom: 12 }}>
          They join this call and can hear everything said from now on.
        </Text>
        {available.map(mate => {
          const member = members.find(m => m.id === mate.id);
          return (
            <View key={mate.id} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 }}>
              <MateAvatar size={44} gradient={mate.gradient} still />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontFamily: font.semibold, fontSize: 16 }}>{mate.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: font.regular, fontSize: 13 }}>{mate.role}</Text>
              </View>
              <GlassPillButton
                prominent={!member}
                height={36}
                width={104}
                fontSize={14}
                disabled={member?.status === "joining"}
                label={member?.status === "joining" ? "Joining…" : member ? "Remove" : "Invite"}
                onPress={() => member ? onRemove(mate.id) : onInvite(mate)}
              />
            </View>
          );
        })}
      </BottomSheetView>
    </BottomSheet>
  );
}
