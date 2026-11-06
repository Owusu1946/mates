import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { ChatIcon } from "../chat/chat-icon";
import { LiquidGlassButton } from "../components/ui/liquid-glass-button";
import { useTheme } from "../theme/provider";
import type { GroupInput, Mate } from "./data";
import { MateAvatar } from "./mate-avatar";

const MIN = 2;
const MAX = 8;

/** Create or edit a group: name, members (2–8) and the leader who hands work out. */
export function GroupForm({
  mates,
  initial,
  submitLabel,
  submitting,
  error,
  onSubmit,
}: {
  mates: Mate[];
  initial?: Partial<GroupInput>;
  submitLabel: string;
  submitting: boolean;
  error?: string | null;
  onSubmit: (input: GroupInput) => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState(initial?.name ?? "");
  const [picked, setPicked] = useState<string[]>(initial?.mateIds ?? []);
  const [leader, setLeader] = useState<string | undefined>(initial?.leaderMateId);
  // The leader must be a member: Cooper if picked, otherwise the first one picked.
  const cooperId = mates.find((m) => m.isDefault)?.id;
  const effectiveLeader = leader && picked.includes(leader) ? leader : cooperId && picked.includes(cooperId) ? cooperId : picked[0];
  const valid = name.trim().length > 0 && picked.length >= MIN && picked.length <= MAX;

  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : current.length >= MAX ? current : [...current, id]));
  const label = { color: colors.textMuted, fontSize: 13, fontFamily: "DMSans_600SemiBold", marginBottom: 8 } as const;

  return (
    <View style={{ gap: 22 }}>
      <View>
        <Text style={label}>Group name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Launch crew"
          placeholderTextColor={colors.textMuted}
          maxLength={60}
          accessibilityLabel="Group name"
          style={{ color: colors.text, fontSize: 16, fontFamily: "DMSans_400Regular", borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 }}
        />
      </View>
      <View>
        <Text style={label}>Mates · {picked.length} of {MIN}–{MAX}</Text>
        <View style={{ gap: 4 }}>
          {mates.map((mate) => {
            const on = picked.includes(mate.id);
            const isLeader = on && mate.id === effectiveLeader;
            return (
              <View key={mate.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={mate.name}
                  onPress={() => toggle(mate.id)}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
                >
                  <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: on ? colors.text : colors.border, backgroundColor: on ? colors.text : "transparent", alignItems: "center", justifyContent: "center" }}>
                    {on && <ChatIcon name="check" color={colors.background} size={14} />}
                  </View>
                  <MateAvatar gradient={mate.gradient} size={40} still />
                  <Text style={{ color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 16, flex: 1 }} numberOfLines={1}>{mate.name}</Text>
                </Pressable>
                {on && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isLeader ? `${mate.name} leads` : `Make ${mate.name} the leader`}
                    onPress={() => setLeader(mate.id)}
                    hitSlop={8}
                    style={{ paddingHorizontal: 10, height: 28, borderRadius: 14, justifyContent: "center", backgroundColor: isLeader ? colors.text : colors.surface }}
                  >
                    <Text style={{ color: isLeader ? colors.background : colors.textSecondary, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>{isLeader ? "Leader" : "Make leader"}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8, lineHeight: 18 }}>
          The leader reads every message and hands work to the right mate. Tag someone with @ to ask them directly.
        </Text>
      </View>
      {error && <Text style={{ color: colors.error, fontSize: 14 }}>{error}</Text>}
      <LiquidGlassButton
        accessibilityLabel={submitLabel}
        size={52}
        tintColor={colors.text}
        style={{ width: "100%" }}
        disabled={!valid || submitting}
        onPress={() => onSubmit({ name: name.trim(), mateIds: picked, leaderMateId: effectiveLeader })}
      >
        {submitting ? <ActivityIndicator color={colors.background} /> : <Text style={{ color: colors.background, fontFamily: "DMSans_600SemiBold", fontSize: 17, opacity: valid ? 1 : 0.5 }}>{submitLabel}</Text>}
      </LiquidGlassButton>
    </View>
  );
}
