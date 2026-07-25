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
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (content: string) => Promise<NoteDocument>;
  onViewReady?: (view: EditorView) => void;
}

export function MarkdownEditor({
  document,
  onDirtyChange,
  onSave,
  onViewReady,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const [content, setContent] = useState(document.content);
  const [diagnostics, setDiagnostics] = useState(document.diagnostics);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("No unsaved changes");
  // The editor view is rebuilt whenever the open note changes, so dirty
  // reporting goes through a ref instead of widening that effect's inputs.
  const reportDirty = useRef(onDirtyChange);
  useEffect(() => {
    reportDirty.current = onDirtyChange;
  }, [onDirtyChange]);

  // Opening another note starts from a clean, non-dirty slate; saving the
  // current one keeps its own "Saved" status instead of being reset here.
  const openPath = useRef(document.path);
  useEffect(() => {
    if (openPath.current === document.path) return;
    openPath.current = document.path;
    setContent(document.content);
    setDiagnostics(document.diagnostics);
    setDirty(false);
    setStatus("No unsaved changes");
    reportDirty.current?.(false);
  }, [document]);

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
            reportDirty.current?.(true);
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
    reportDirty.current?.(false);
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
