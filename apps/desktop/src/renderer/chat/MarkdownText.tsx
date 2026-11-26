import { visibleMentionText } from "@expojet/api-contract/chat-mentions";
import { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitBlocks } from "./markdownBlocks.logic.ts";

/**
 * Elements in the app's own styles, from its tokens. Links open in your browser (the app never
 * navigates away from its own pages; DesktopWebLinks.ts sends https links out).
 */
const COMPONENTS: Components = {
  p: ({ node: _, ...props }) => <p className="leading-relaxed" {...props} />,
  a: ({ node: _, ...props }) => <a className="text-brand underline underline-offset-2 hover:opacity-80" target="_blank" rel="noreferrer" {...props} />,
  ul: ({ node: _, ...props }) => <ul className="list-disc space-y-1 ps-5" {...props} />,
  ol: ({ node: _, ...props }) => <ol className="list-decimal space-y-1 ps-5" {...props} />,
  li: ({ node: _, ...props }) => <li className="leading-relaxed ps-0.5" {...props} />,
  h1: ({ node: _, ...props }) => <h3 className="text-base font-semibold" {...props} />,
  h2: ({ node: _, ...props }) => <h3 className="text-base font-semibold" {...props} />,
  h3: ({ node: _, ...props }) => <h4 className="font-semibold" {...props} />,
  blockquote: ({ node: _, ...props }) => <blockquote className="border-s-2 border-line ps-3 text-ink-soft" {...props} />,
  hr: () => <hr className="border-line" />,
  pre: ({ node: _, ...props }) => <pre className="overflow-x-auto rounded-xl border border-line bg-raised p-3 text-sm leading-relaxed [&_code]:bg-transparent [&_code]:p-0" {...props} />,
  code: ({ node: _, ...props }) => <code className="rounded-md bg-hover-fill px-1 py-0.5 font-mono text-[0.9em]" {...props} />,
  table: ({ node: _, ...props }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: ({ node: _, ...props }) => <th className="border-b border-line px-2 py-1.5 text-start font-semibold" {...props} />,
  td: ({ node: _, ...props }) => <td className="border-b border-line/60 px-2 py-1.5 align-top" {...props} />,
};

/** One block, memoised on its text: while a reply streams, only the block being written renders again. */
const Block = memo(function Block({ text }: { text: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {text}
    </Markdown>
  );
});

/** A mate's words as markdown: lists, emphasis, code, links and tables, with @-mentions shown as names. */
export function MarkdownText({ text }: { text: string }) {
  const blocks = splitBlocks(visibleMentionText(text));
  return (
    <div className="flex flex-col gap-3 wrap-anywhere select-text">
      {blocks.map((block, index) => (
        <Block key={index} text={block} />
      ))}
    </div>
  );
}
