import * as WebBrowser from "expo-web-browser";
import { memo, useMemo } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import Markdown, { renderRules, type ASTNode, type RenderRules } from "react-native-markdown-display";
import { prepareMarkdown } from "./markdown-text";

export type RichTextColors = { text: string; muted: string; surface: string; border: string };

const SIZES = { chat: { font: 17, line: 25 }, compact: { font: 15, line: 22 } } as const;
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

/**
 * Column widths from what each column holds, so "Rank" stays narrow and descriptions get room.
 * The table scrolls sideways instead of squeezing six columns into a phone's width.
 */
const widths = new WeakMap<ASTNode, number[]>();
const textOf = (node: ASTNode): string => node.content || node.children.map(textOf).join("");
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
  const heading = (font: number, line: number, top: number) => ({ flexDirection: "column" as const, color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: font, lineHeight: line, letterSpacing: -0.3, marginTop: top, marginBottom: 6 });
  const code = { color: colors.text, backgroundColor: colors.surface, borderWidth: 0, fontFamily: MONO, fontSize: size.font - 3, lineHeight: size.line - 5 };
  return {
    body: { color: colors.text, fontFamily: "DMSans_400Regular", fontSize: size.font, lineHeight: size.line, letterSpacing: -0.2 },
    paragraph: { marginTop: 0, marginBottom: 10 },
    heading1: heading(size.font + 5, size.line + 5, 14),
    heading2: heading(size.font + 3, size.line + 3, 14),
    heading3: heading(size.font + 1, size.line + 1, 12),
    heading4: heading(size.font, size.line, 10),
    heading5: heading(size.font, size.line, 10),
    heading6: heading(size.font, size.line, 10),
    // The bold face is its own font file; a bold weight on top would thicken it twice on Android.
    strong: { fontFamily: "DMSans_700Bold", fontWeight: "normal" as const },
    link: { color: colors.muted, fontFamily: "DMSans_500Medium", fontSize: size.font - 3, textDecorationLine: "none" as const },
    hr: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginVertical: 14 },
    bullet_list: { marginBottom: 6 },
    ordered_list: { marginBottom: 6 },
    bullet_list_icon: { marginLeft: 2, marginRight: 8, fontFamily: "DMSans_700Bold" },
    ordered_list_icon: { marginLeft: 2, marginRight: 6 },
    task_item: { flex: 1, marginLeft: 2 },
    code_inline: { ...code, padding: 0 },
    code_block: { ...code, borderRadius: 14, padding: 12, marginVertical: 6 },
    fence: { ...code, borderRadius: 14, padding: 12, marginVertical: 6 },
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
