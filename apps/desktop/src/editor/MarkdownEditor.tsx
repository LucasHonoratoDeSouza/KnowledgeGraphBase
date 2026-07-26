import { useEffect, useRef, useState } from "react";

import { markdown } from "@codemirror/lang-markdown";
import { EditorView, basicSetup } from "codemirror";

import { ReadingView } from "./ReadingView";

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

type ViewMode = "source" | "reading";

interface MarkdownEditorProps {
  document: NoteDocument;
  onDirtyChange?: (dirty: boolean) => void;
  onOpenNote?: (target: string) => void;
  onSave: (content: string) => Promise<NoteDocument>;
  onViewReady?: (view: EditorView) => void;
}

export function MarkdownEditor({
  document,
  onDirtyChange,
  onOpenNote,
  onSave,
  onViewReady,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const [content, setContent] = useState(document.content);
  const [diagnostics, setDiagnostics] = useState(document.diagnostics);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("No unsaved changes");
  const [mode, setMode] = useState<ViewMode>("source");
  // The live buffer, so switching Reading → Source restores unsaved edits
  // instead of reloading the last opened revision.
  const buffer = useRef(document.content);
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
    buffer.current = document.content;
    setContent(document.content);
    setDiagnostics(document.diagnostics);
    setDirty(false);
    setStatus("No unsaved changes");
    reportDirty.current?.(false);
  }, [document]);

  useEffect(() => {
    if (!host.current || mode !== "source") return;

    const view = new EditorView({
      doc: buffer.current,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.contentAttributes.of({
          "aria-label": `Edit ${document.path}`,
          "aria-describedby": "markdown-editor-description",
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            buffer.current = update.state.doc.toString();
            setContent(buffer.current);
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
    // `content` is deliberately absent: rebuilding the view on every keystroke
    // would fight the editor. Switching modes replays the current buffer.
  }, [document.content, document.path, mode, onViewReady]);

  async function save() {
    const saved = await onSave(content);
    setContent(saved.content);
    buffer.current = saved.content;
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
      <div className="editor-modes" role="group" aria-label="View mode">
        <button
          aria-pressed={mode === "source"}
          onClick={() => {
            setMode("source");
          }}
          type="button"
        >
          Source
        </button>
        <button
          aria-pressed={mode === "reading"}
          onClick={() => {
            setMode("reading");
          }}
          type="button"
        >
          Reading
        </button>
      </div>
      {mode === "source" ? (
        <div ref={host} />
      ) : (
        <div className="reading-host">
          <ReadingView
            content={content}
            {...(onOpenNote ? { onOpenNote } : {})}
          />
        </div>
      )}
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
