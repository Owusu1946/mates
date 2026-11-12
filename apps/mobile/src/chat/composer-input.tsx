import { useAui, useAuiState } from "@assistant-ui/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, TextInput, type TextInputProps } from "react-native";

/**
 * The composer's text field, holding its own text so a keystroke is never overwritten.
 *
 * ComposerPrimitive.Input binds `value` to the composer store; on native that update lands a
 * render late, so fast typing received older text back and the cursor jumped. Here the field
 * owns its value and mirrors it to the store. Store changes are applied only when they did not
 * come from this field's own typing: clearing on send, an inserted mention, dictation.
 */
export function ComposerTextInput({ onSubmitWeb, ...props }: Omit<TextInputProps, "value" | "onChangeText"> & { onSubmitWeb?: () => void }) {
  const aui = useAui();
  const storeText = useAuiState((state) => state.composer.text);
  const [text, setText] = useState(storeText);
  // Values typed here that the store has not echoed back yet, oldest first.
  const pending = useRef<string[]>([]);

  // Derive sizing bounds from the caller's style so we can manage height explicitly.
  // React Native's multiline TextInput does not shrink its native height when value is
  // cleared programmatically, so we track content size and reset on send.
  const flatStyle = useMemo(() => StyleSheet.flatten(props.style) ?? {}, [props.style]);
  const minHeight = (flatStyle.minHeight as number) ?? 0;
  const maxHeight = (flatStyle.maxHeight as number) ?? Infinity;
  const [contentHeight, setContentHeight] = useState(minHeight);

  useEffect(() => {
    const echo = pending.current.indexOf(storeText);
    if (echo >= 0) {
      // Our own keystroke; anything older than it can no longer arrive.
      pending.current.splice(0, echo + 1);
      return;
    }
    pending.current = [];
    setText(storeText);
    // Store was cleared externally (e.g. after send) — reset height so the field collapses.
    if (!storeText) setContentHeight(minHeight);
  }, [storeText, minHeight]);

  const onChangeText = useCallback(
    (value: string) => {
      setText(value);
      pending.current.push(value);
      aui.composer.setText(value);
    },
    [aui],
  );

  return (
    <TextInput
      {...props}
      value={text}
      onChangeText={onChangeText}
      onContentSizeChange={(e) => {
        props.onContentSizeChange?.(e);
        const h = Math.min(Math.max(e.nativeEvent.contentSize.height, minHeight), maxHeight);
        setContentHeight(h);
      }}
      style={[props.style, { height: Math.max(contentHeight, minHeight) }]}
      onKeyPress={(event) => {
        props.onKeyPress?.(event);
        // Web keeps Enter-to-send; on phones Enter is a newline and the send button sends.
        const native = event.nativeEvent as { key: string; shiftKey?: boolean; isComposing?: boolean };
        if (Platform.OS === "web" && onSubmitWeb && native.key === "Enter" && !native.shiftKey && !native.isComposing) {
          event.preventDefault();
          onSubmitWeb();
        }
      }}
    />
  );
}
