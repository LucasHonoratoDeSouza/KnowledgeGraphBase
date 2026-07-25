import { useEffect, useRef, useState } from "react";

import { markdown } from "@codemirror/lang-markdown";
import { EditorView, basicSetup } from "codemirror";

export interface MarkdownDiagnostic {
  code: "malformed_frontmatter" | "malformed_wiki_link";
  message: string;
  line: number;
}

export interface NoteDocument {
  path: string;
  content: string;
  diagnostics: MarkdownDiagnostic[];
}

interface MarkdownEditorProps {
  document: NoteDocument;
  onSave: (content: string) => Promise<NoteDocument>;
  onViewReady?: (view: EditorView) => void;
}

export function MarkdownEditor({
  document,
  onSave,
  onViewReady,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const [content, setContent] = useState(document.content);
  const [diagnostics, setDiagnostics] = useState(document.diagnostics);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("No unsaved changes");

  useEffect(() => {
    if (!host.current) return;

    const view = new EditorView({
      doc: document.content,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.contentAttributes.of({
          "aria-label": `Edit ${document.path}`,
          "aria-describedby": "markdown-editor-description",
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setContent(update.state.doc.toString());
            setDirty(true);
            setStatus("Unsaved changes");
          }
        }),
      ],
      parent: host.current,
    });
    onViewReady?.(view);

    return () => {
      view.destroy();
    };
  }, [document.content, document.path, onViewReady]);

  async function save() {
    const saved = await onSave(content);
    setContent(saved.content);
    setDiagnostics(saved.diagnostics);
    setDirty(false);
    setStatus("Saved");
  }

  return (
    <section
      aria-label={`Markdown note ${document.path}`}
      className="markdown-editor"
    >
      <span className="visually-hidden" id="markdown-editor-description">
        Markdown with frontmatter and wiki links
      </span>
      <div ref={host} />
      {diagnostics.length > 0 ? (
        <aside aria-label="Markdown diagnostics">
          <ul>
            {diagnostics.map((diagnostic) => (
              <li key={`${diagnostic.code}-${String(diagnostic.line)}`}>
                Line {diagnostic.line}: {diagnostic.message}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
      <footer>
        <p aria-live="polite" role="status">
          {status}
        </p>
        <button
          disabled={!dirty}
          onClick={() => {
            void save();
          }}
          type="button"
        >
          Save note
        </button>
      </footer>
    </section>
  );
}
