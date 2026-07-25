import { parseNote, type InlineNode, type MarkdownBlock } from "./markdown";

function Inline({
  nodes,
  onOpen,
}: {
  nodes: InlineNode[];
  onOpen: ((target: string) => void) | undefined;
}) {
  return (
    <>
      {nodes.map((node, index) => {
        const key = `${node.kind}-${String(index)}`;
        if (node.kind === "code") return <code key={key}>{node.value}</code>;
        if (node.kind === "strong")
          return <strong key={key}>{node.value}</strong>;
        if (node.kind === "emphasis") return <em key={key}>{node.value}</em>;
        if (node.kind === "wikiLink") {
          return (
            <button
              className="reading-wiki-link"
              key={key}
              onClick={() => {
                onOpen?.(node.href);
              }}
              type="button"
            >
              {node.value}
            </button>
          );
        }
        if (node.kind === "link") {
          return (
            <span className="reading-link" key={key} title={node.href}>
              {node.value}
            </span>
          );
        }
        return <span key={key}>{node.value}</span>;
      })}
    </>
  );
}

function Block({
  block,
  onOpenNote,
}: {
  block: MarkdownBlock;
  onOpenNote?: ((target: string) => void) | undefined;
}) {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${String(Math.min(block.level, 6))}` as "h1";
      return (
        <Tag>
          <Inline nodes={block.content} onOpen={onOpenNote} />
        </Tag>
      );
    }
    case "list":
      return block.ordered ? (
        <ol>
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} onOpen={onOpenNote} />
            </li>
          ))}
        </ol>
      ) : (
        <ul>
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} onOpen={onOpenNote} />
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote>
          <Inline nodes={block.content} onOpen={onOpenNote} />
        </blockquote>
      );
    case "code":
      return (
        <pre>
          <code>{block.value}</code>
        </pre>
      );
    case "rule":
      return <hr />;
    default:
      return (
        <p>
          <Inline nodes={block.content} onOpen={onOpenNote} />
        </p>
      );
  }
}

/**
 * The rendered counterpart of the source editor (#10). Everything is emitted as
 * React elements, so raw HTML inside a note stays inert text.
 */
export function ReadingView({
  content,
  onOpenNote,
}: {
  content: string;
  onOpenNote?: ((target: string) => void) | undefined;
}) {
  const note = parseNote(content);
  return (
    <article aria-label="Rendered note" className="reading-view">
      {note.metadata.length > 0 ? (
        <dl aria-label="Note metadata" className="reading-metadata">
          {note.metadata.map((field) => (
            <div key={field.key}>
              <dt>{field.key}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {note.blocks.map((block, index) => (
        <Block block={block} key={index} onOpenNote={onOpenNote} />
      ))}
    </article>
  );
}
