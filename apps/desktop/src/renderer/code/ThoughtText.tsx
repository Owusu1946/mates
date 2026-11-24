import { inlineParts, thoughtBlocks } from "./thought.logic.ts";

function Line({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((part, index) =>
        part.code ? (
          <code key={index} className="rounded bg-hover-fill px-1 py-px font-mono text-[0.85em] text-ink/90">
            {part.text}
          </code>
        ) : part.bold ? (
          <strong key={index} className="font-semibold text-ink/90">
            {part.text}
          </strong>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/** A thought's body: paragraphs and lists, with `code` and **bold**, in the quiet reasoning colour. */
export function ThoughtText({ body }: { body: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-soft">
      {thoughtBlocks(body).map((block, index) =>
        block.type === "p" ? (
          <p key={index}>
            <Line text={block.text} />
          </p>
        ) : block.type === "ol" ? (
          <ol key={index} className="ms-5 list-decimal space-y-0.5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Line text={item} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={index} className="ms-5 list-disc space-y-0.5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Line text={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
