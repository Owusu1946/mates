import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { memo, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Markdown, { renderRules, type ASTNode, type RenderRules } from "react-native-markdown-display";
import { ChatIcon } from "../../chat/chat-icon";
import { prepareMarkdown } from "./markdown-text";

export type RichTextColors = { text: string; muted: string; surface: string; border: string; codeSurface?: string };

const SIZES = { chat: { font: 17, line: 25 }, compact: { font: 15, line: 22 } } as const;
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

/**
 * Column widths from what each column holds, so "Rank" stays narrow and descriptions get room.
 * The table scrolls sideways instead of squeezing six columns into a phone's width.
 */
const widths = new WeakMap<ASTNode, number[]>();
const textOf = (node: ASTNode): string => node.content || node.children.map(textOf).join("");
const CODE_TOKENS = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|type|interface|async|await|export|import|from|new|class)\b|\b(?:true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/g;
const TS_KEYWORDS = new Set(["const", "let", "var", "function", "return", "type", "interface", "async", "await", "export", "import", "from", "new", "class"]);
function highlightedCode(content: string, language: string | null, isDark: boolean) {
  if (language && !/^(?:TS|TSX|JS|JSX|TYPESCRIPT|JAVASCRIPT)$/.test(language)) return content;
  return content.split(CODE_TOKENS).map((token, index) => {
    if (!token) return null;
    const color = TS_KEYWORDS.has(token) ? (isDark ? "#7db4ff" : "#2563eb")
      : /^(?:true|false|null|undefined)$/.test(token) ? (isDark ? (isDark ? "#7ee787" : "#15803d") : "#15803d")
        : /^(?:\d+(?:\.\d+)?|["'`])/.test(token) ? (isDark ? "#7ee787" : "#15803d")
          : null;
    return color ? <Text key={index} style={{ color }}>{token}</Text> : token;
  });
}

function codeLanguageLabel(language: string | null) {
  if (!language) return "Code";
  return ({
    TS: "TypeScript",
    TSX: "TSX",
    JS: "JavaScript",
    JSX: "JSX",
    JSON: "JSON",
    BASH: "Shell",
    SH: "Shell",
    PYTHON: "Python",
    PY: "Python",
    TSCRIPT: "TypeScript",
    MARKDOWN: "Markdown",
    MD: "Markdown",
    YAML: "YAML",
    YML: "YAML",
    SQL: "SQL",
    HTML: "HTML",
    CSS: "CSS",
  } as Record<string, string>)[language] ?? language.charAt(0) + language.slice(1).toLowerCase();
}

function CodeFence({ content, language, containerStyle, headerStyle, labelStyle, buttonStyle, buttonTextStyle, codeStyle, foreground }: {
  content: string;
  language: string | null;
  containerStyle: StyleProp<ViewStyle>;
  headerStyle: StyleProp<ViewStyle>;
  labelStyle: StyleProp<TextStyle>;
  buttonStyle: StyleProp<ViewStyle>;
  buttonTextStyle: StyleProp<TextStyle>;
  codeStyle: StyleProp<TextStyle>;
  foreground: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 1400);
    return () => clearTimeout(timer);
  }, [copyState]);

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(content);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <View style={containerStyle}>
      <View style={headerStyle}>
        <Text style={labelStyle}>{codeLanguageLabel(language)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={copyState === "copied" ? "Code copied" : copyState === "failed" ? "Copy failed. Try again." : "Copy code"} onPress={() => void copy()} hitSlop={8} style={({ pressed }) => [buttonStyle, pressed && { opacity: 0.65 }]}>
          <ChatIcon name={copyState === "copied" ? "check" : "copy"} color={copyState === "copied" ? "#4ade80" : copyState === "failed" ? "#f87171" : foreground} size={15} />
          <Text style={buttonTextStyle}>{copyState === "copied" ? "Copied" : copyState === "failed" ? "Try again" : "Copy code"}</Text>
        </Pressable>
      </View>
      <Text selectable style={codeStyle}>{highlightedCode(content, language, foreground.toLowerCase() === "#fafafa")}</Text>
    </View>
  );
}
function columnWidths(table: ASTNode) {
  const known = widths.get(table);
  if (known) return known;
  const longest: number[] = [];
  for (const section of table.children)
    for (const row of section.children)
      row.children.forEach((cell, i) => {
        longest[i] = Math.max(longest[i] ?? 0, textOf(cell).length);
      });
  // Short values size to fit; prose gets a wider column so a row isn't dozens of lines tall.
  const result = longest.map((chars) => (chars > 60 ? 280 : Math.round(Math.min(220, Math.max(64, chars * 7.6 + 26)))));
  widths.set(table, result);
  return result;
}
function cellWidth(node: ASTNode, parents: ASTNode[]) {
  const table = parents.find((parent) => parent.type === "table");
  const row = parents[0];
  return table && row ? columnWidths(table)[row.children.indexOf(node)] ?? 120 : 120;
}

const RULES: RenderRules = {
  // A checklist item's box is its marker; a bullet in front of it would be one mark too many.
  list_item: (node, children, parents, styles, inherited) =>
    /^[☐☑]/.test(textOf(node)) ? (
      <View key={node.key} style={styles._VIEW_SAFE_list_item}>
        <View style={styles._VIEW_SAFE_task_item}>{children}</View>
      </View>
    ) : (
      renderRules.list_item!(node, children, parents, styles, inherited)
    ),
  table: (node, children, _parents, styles) => (
    <ScrollView key={node.key} horizontal showsHorizontalScrollIndicator={false} style={styles._VIEW_SAFE_table_scroll}>
      <View style={styles._VIEW_SAFE_table}>{children}</View>
    </ScrollView>
  ),
  fence: (node, _children, _parents, styles, inherited) => {
    const content = node.content.endsWith("\n") ? node.content.slice(0, -1) : node.content;
    const sourceInfo = (node as ASTNode & { sourceInfo?: string }).sourceInfo?.trim().split(/\s+/, 1)[0];
    const language = sourceInfo && /^[a-z\d_+#.-]{1,20}$/i.test(sourceInfo) ? sourceInfo.toUpperCase() : null;
    return (
      <CodeFence
        key={node.key}
        content={content}
        language={language}
        containerStyle={styles._VIEW_SAFE_fence_container}
        headerStyle={styles._VIEW_SAFE_fence_header}
        labelStyle={styles._VIEW_SAFE_fence_label}
        buttonStyle={styles._VIEW_SAFE_fence_copy_button}
        buttonTextStyle={styles._VIEW_SAFE_fence_copy_text}
        codeStyle={[inherited, styles._VIEW_SAFE_fence_code]}
        foreground={String(StyleSheet.flatten(styles._VIEW_SAFE_fence_label as StyleProp<TextStyle>)?.color ?? "#fafafa")}
      />
    );
  },
  th: (node, children, parents, styles) => (
    <View key={node.key} style={[styles._VIEW_SAFE_cell, { width: cellWidth(node, parents) }]}>
      {children}
    </View>
  ),
  td: (node, children, parents, styles) => (
    <View key={node.key} style={[styles._VIEW_SAFE_cell, { width: cellWidth(node, parents) }]}>
      {children}
    </View>
  ),
};

/**
 * Every text size states its own line height. The renderer passes the body's line height down
 * to headings, table cells and code, so a 25pt line under a larger heading made lines overlap.
 */
function createStyles(colors: RichTextColors, size: { font: number; line: number }) {
  const heading = (font: number, line: number, top: number) => ({ flexDirection: "column" as const, color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: font, lineHeight: line, letterSpacing: -0.35, marginTop: top, marginBottom: 8 });
  const code = { color: colors.text, fontFamily: MONO, fontSize: size.font >= 17 ? 11 : 10, lineHeight: size.font >= 17 ? 16 : 14 };
  const codeSurface = colors.codeSurface ?? colors.surface;
  return {
    body: { color: colors.text, fontFamily: "DMSans_400Regular", fontSize: size.font, lineHeight: size.line, letterSpacing: -0.2 },
    paragraph: { marginTop: 0, marginBottom: 13 },
    heading1: heading(size.font + 5, size.line + 6, 20),
    heading2: heading(size.font + 3, size.line + 4, 18),
    heading3: heading(size.font + 1, size.line + 2, 15),
    heading4: heading(size.font, size.line, 10),
    heading5: heading(size.font, size.line, 10),
    heading6: heading(size.font, size.line, 10),
    // The bold face is its own font file; a bold weight on top would thicken it twice on Android.
    strong: { fontFamily: "DMSans_700Bold", fontWeight: "normal" as const },
    link: { color: colors.text, fontFamily: "DMSans_500Medium", fontSize: size.font - 1, textDecorationLine: "underline" as const },
    hr: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginVertical: 14 },
    bullet_list: { marginBottom: 6 },
    ordered_list: { marginBottom: 6 },
    bullet_list_icon: { marginLeft: 2, marginRight: 8, fontFamily: "DMSans_700Bold" },
    ordered_list_icon: { marginLeft: 2, marginRight: 6 },
    task_item: { flex: 1, marginLeft: 2 },
    code_inline: { ...code, backgroundColor: codeSurface, borderRadius: 4, paddingHorizontal: 3 },
    code_block: { ...code, backgroundColor: codeSurface, borderRadius: 10, padding: 10, marginVertical: 6 },
    fence_container: { backgroundColor: codeSurface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, overflow: "hidden" as const, marginVertical: 8 },
    fence_header: { minHeight: 36, paddingHorizontal: 12, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    fence_label: { color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 12, letterSpacing: 0 },
    fence_copy_button: { minHeight: 30, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 6, borderRadius: 8, paddingHorizontal: 8 },
    fence_copy_text: { color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 11.5 },
    fence_code: { ...code, backgroundColor: "transparent" as const, paddingHorizontal: 12, paddingVertical: 10 },
    blockquote: { backgroundColor: colors.surface, borderColor: colors.border, borderLeftWidth: 3, marginLeft: 0, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginVertical: 6 },
    table_scroll: { marginTop: 4, marginBottom: 12 },
    table: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 12, overflow: "hidden" as const },
    thead: { backgroundColor: colors.surface },
    tr: { flexDirection: "row" as const, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    // Cells are sized by the rules above with their own style: the library's th/td defaults flex
    // to share the row, which is what squeezed wide tables. th/td here only style the text.
    cell: { flexGrow: 0, flexShrink: 0, paddingHorizontal: 10, paddingVertical: 8 },
    th: { fontFamily: "DMSans_600SemiBold", fontSize: size.font - 3, lineHeight: size.line - 5, letterSpacing: 0 },
    td: { fontSize: size.font - 3, lineHeight: size.line - 5, letterSpacing: 0 },
  };
}

const openLink = (url: string) => {
  if (url.startsWith("https://") || url.startsWith("http://")) void WebBrowser.openBrowserAsync(url);
  return false;
};

/**
 * What a mate wrote, rendered: headings, lists, tables that scroll sideways, code and links
 * (which open in the in-app browser). `compact` is for notes and results outside the chat.
 */
export const RichText = memo(function RichText({ children, colors, size = "chat" }: { children: string; colors: RichTextColors; size?: keyof typeof SIZES }) {
  const { text, muted, surface, border } = colors;
  const styles = useMemo(() => createStyles({ text, muted, surface, border }, SIZES[size]), [text, muted, surface, border, size]);
  const markdown = useMemo(() => prepareMarkdown(children), [children]);
  return (
    <Markdown style={styles} rules={RULES} onLinkPress={openLink}>
      {markdown}
    </Markdown>
  );
});
