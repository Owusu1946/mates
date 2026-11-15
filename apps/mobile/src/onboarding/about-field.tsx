import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ChatIcon } from "../chat/chat-icon";
import { useDictation } from "../chat/use-dictation";
import { VoiceDictationBar, type VoiceDictationStatus } from "../chat/voice-dictation-bar";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import { MAX_BIO_CHARS } from "./about-data";

const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium" };

/** Starters for people who don't know where to begin: each adds a line to finish in their words. */
const PROMPTS = [
  { label: "What you do", line: "I work as " },
  { label: "Your people", line: "The people who matter most to me are " },
  { label: "What to help with", line: "I'd love help with " },
  { label: "How you like things", line: "I like things done " },
];

/**
 * A large text box for telling your mates about yourself, by typing or talking (the composer's
 * dictation: a live waveform, then text added where you left off), with starter prompts.
 */
export function AboutField({ value, onChange, mateName, autoFocus }: { value: string; onChange: (text: string) => void; mateName: string; autoFocus?: boolean }) {
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<VoiceDictationStatus>("listening");
  const [level, setLevel] = useState(0.25);
  const stopRef = useRef<() => void>(() => {});
  const dictation = useDictation({ onLevel: setLevel, onAutoStop: () => stopRef.current() });
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;
  // The latest text, for adding speech after a recording that outlived a few renders.
  const valueRef = useRef(value);
  valueRef.current = value;
  // Dictation is for phones; the web build types.
  const canTalk = Platform.OS !== "web";

  useEffect(() => () => void dictationRef.current.cancel(), []);

  const append = useCallback(
    (text: string) => {
      const before = valueRef.current;
      const joined = !before.trim() ? text : /[\s]$/.test(before) ? before + text : `${before} ${text}`;
      onChange(joined.slice(0, MAX_BIO_CHARS));
    },
    [onChange],
  );

  const start = async () => {
    haptic.light();
    input.current?.blur();
    setLevel(0.25);
    setStatus("listening");
    setListening(true);
    if (!(await dictation.start())) setListening(false);
  };
  const stop = async () => {
    setStatus("transcribing");
    const spoken = (await dictation.stop()).trim();
    setListening(false);
    setStatus("listening");
    if (spoken) {
      haptic.success();
      append(spoken);
    }
  };
  stopRef.current = () => void stop();
  const cancel = () => {
    void dictation.cancel();
    setListening(false);
    setStatus("listening");
  };

  const prompt = (line: string) => {
    haptic.selection();
    const before = valueRef.current.trimEnd();
    onChange((before ? `${before}\n${line}` : line).slice(0, MAX_BIO_CHARS));
    setTimeout(() => input.current?.focus(), 50);
  };

  const barColors = {
    foreground: colors.text,
    background: colors.background,
    muted: colors.surfaceElevated,
    mutedForeground: colors.textMuted,
    border: colors.border,
    primary: colors.text,
    primaryForeground: colors.background,
    composer: colors.surface,
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ borderRadius: 20, borderCurve: "continuous", backgroundColor: colors.surface, padding: 16, gap: 10 }}>
        <TextInput
          ref={input}
          value={value}
          onChangeText={(text) => onChange(text.slice(0, MAX_BIO_CHARS))}
          multiline
          autoFocus={autoFocus}
          editable={!listening}
          maxLength={MAX_BIO_CHARS}
          placeholder={`Tell ${mateName} about your work, your people, what you're working towards, and how you like things done.`}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={`Tell ${mateName} about yourself`}
          style={{ color: colors.text, fontFamily: font.regular, fontSize: 16, lineHeight: 23, minHeight: 150, maxHeight: 280, padding: 0, textAlignVertical: "top" }}
        />
        {listening ? (
          <View style={{ height: 52 }}>
            <VoiceDictationBar status={status} transcript="" audioLevel={level} colors={barColors} onStop={() => void stop()} onSend={() => void stop()} onCancel={cancel} />
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 12 }}>{value.length > MAX_BIO_CHARS * 0.8 ? `${value.length} / ${MAX_BIO_CHARS}` : canTalk ? "Type, or tap the mic and talk" : ""}</Text>
            {canTalk && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Talk instead of typing"
                onPress={() => void start()}
                style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.text, opacity: pressed ? 0.75 : 1 })}
              >
                <ChatIcon name="mic" color={colors.background} size={20} />
              </Pressable>
            )}
          </View>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
        {PROMPTS.map((p) => (
          <Pressable
            key={p.label}
            accessibilityRole="button"
            accessibilityHint="Adds a starter line to finish"
            disabled={listening}
            onPress={() => prompt(p.line)}
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, opacity: listening ? 0.4 : pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 14 }}>{p.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
