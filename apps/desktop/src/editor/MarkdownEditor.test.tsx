import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import axe from "axe-core";
import type { EditorView } from "codemirror";
import { describe, expect, it, vi } from "vitest";

import { MarkdownEditor, type NoteDocument } from "./MarkdownEditor";

const note: NoteDocument = {
  path: "notes/alpha.md",
  content: "---\ntitle: Alpha\n---\n# Alpha\nSee [[Beta]].\n",
  diagnostics: [],
};

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof MarkdownEditor>> = {},
) {
  let view: EditorView | undefined;
  const onSave = vi.fn().mockImplementation((content: string) =>
    Promise.resolve({
      ...note,
      content,
    }),
  );
  const result = render(
    <MarkdownEditor
      document={note}
      onSave={onSave}
      onViewReady={(ready) => {
        view = ready;
      }}
      {...overrides}
    />,
  );
  return { ...result, getView: () => view, onSave };
}

describe("CodeMirror Markdown editor boundary", () => {
  it("renders an accessible Markdown editing surface", () => {
    renderEditor();

    expect(
      screen.getByRole("textbox", { name: "Edit notes/alpha.md" }),
    ).toBeVisible();
  });

  it("loads the exact Markdown document into CodeMirror", () => {
    const { getView } = renderEditor();

    expect(getView()?.state.doc.toString()).toBe(note.content);
  });

  it("keeps save disabled until the document changes", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Save note" })).toBeDisabled();
  });

  it("saves the exact edited UTF-8 Markdown", async () => {
    const { getView, onSave } = renderEditor();
    const edited = `${note.content}\nCafé 🧠 [[Gamma]]\n`;
    act(() => {
      getView()?.dispatch({
        changes: { from: 0, to: note.content.length, insert: edited },
      });
    });

    screen.getByRole("button", { name: "Save note" }).click();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(edited);
    });
  });

  it("marks the editor clean after a successful save", async () => {
    const { getView } = renderEditor();
    act(() => {
      getView()?.dispatch({
        changes: { from: note.content.length, insert: "Changed" },
      });
    });
    const save = screen.getByRole("button", { name: "Save note" });
    save.click();

    await waitFor(() => expect(save).toBeDisabled());
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("reports unsaved changes to the surrounding tab strip", async () => {
    const onDirtyChange = vi.fn();
    const { getView } = renderEditor({ onDirtyChange });
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);

    act(() => {
      getView()?.dispatch({
        changes: { from: note.content.length, insert: "Changed" },
      });
    });

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    screen.getByRole("button", { name: "Save note" }).click();

    await waitFor(() => {
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    });
  });

  it("starts clean again when another note is opened", async () => {
    const onDirtyChange = vi.fn();
    const { getView, rerender } = renderEditor({ onDirtyChange });
    act(() => {
      getView()?.dispatch({
        changes: { from: note.content.length, insert: "Changed" },
      });
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    rerender(
      <MarkdownEditor
        document={{ path: "notes/beta.md", content: "# Beta", diagnostics: [] }}
        onDirtyChange={onDirtyChange}
        onSave={() =>
          Promise.resolve({
            path: "notes/beta.md",
            content: "# Beta",
            diagnostics: [],
          })
        }
      />,
    );

    await waitFor(() => {
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    });
    expect(screen.getByRole("button", { name: "Save note" })).toBeDisabled();
  });

  it("saves a dirty note with Cmd/Ctrl+S from inside the editor", async () => {
    const { getView, onSave } = renderEditor();
    const edited = `${note.content}Saved by keyboard\n`;
    act(() => {
      getView()?.dispatch({
        changes: { from: 0, to: note.content.length, insert: edited },
      });
    });

    // The editor swallows keys through its own handlers, so the shared layer
    // has to see the chord first (#34).
    fireEvent.keyDown(getView()?.contentDOM ?? document, {
      key: "s",
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(edited);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("does nothing when Cmd/Ctrl+S is pressed on a clean note", () => {
    const { onSave } = renderEditor();

    fireEvent.keyDown(document, { key: "s", ctrlKey: true });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("No unsaved changes");
  });

  it("shows typed metadata diagnostics without hiding the content", () => {
    const malformed: NoteDocument = {
      path: "broken.md",
      content: "---\ntitle: Broken\n[[unfinished\n",
      diagnostics: [
        {
          code: "malformed_frontmatter",
          line: 1,
          message: "Frontmatter is not closed",
        },
        {
          code: "malformed_wiki_link",
          line: 3,
          message: "Wiki link is not closed",
        },
      ],
    };
    const { getView } = renderEditor({ document: malformed });

    expect(screen.getByText("Line 1: Frontmatter is not closed")).toBeVisible();
    expect(screen.getByText("Line 3: Wiki link is not closed")).toBeVisible();
    expect(getView()?.state.doc.toString()).toBe(malformed.content);
  });

  it("labels frontmatter and wiki-link awareness for assistive technology", () => {
    renderEditor();

    expect(
      screen.getByText("Markdown with frontmatter and wiki links"),
    ).toHaveClass("visually-hidden");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderEditor();

    expect((await axe.run(container)).violations).toEqual([]);
  });
});

describe("reading view", () => {
  it("renders Markdown structure instead of source when Reading is selected", () => {
    const rich: NoteDocument = {
      path: "notes/rich.md",
      content:
        '---\ntitle: "Rich"\ncontext: "A note about rendering."\n---\n\n# Rich note\n\nSome **bold** and *italic* text with `code`.\n\n- first item\n- second item\n\n> a quotation\n\n---\n\nLinks to [[Beta]] and [docs](https://example.com).\n',
      diagnostics: [],
    };
    renderEditor({ document: rich });

    fireEvent.click(screen.getByRole("button", { name: "Reading" }));

    const rendered = screen.getByRole("article", { name: "Rendered note" });
    expect(
      within(rendered).getByRole("heading", { name: "Rich note", level: 1 }),
    ).toBeVisible();
    expect(within(rendered).getByText("bold").tagName).toBe("STRONG");
    expect(within(rendered).getByText("italic").tagName).toBe("EM");
    expect(within(rendered).getByText("code").tagName).toBe("CODE");
    expect(within(rendered).getAllByRole("listitem")).toHaveLength(2);
    expect(
      within(rendered).getByText("a quotation").closest("blockquote"),
    ).not.toBeNull();
    expect(rendered.querySelector("hr")).not.toBeNull();
    expect(within(rendered).getByText("docs")).toBeVisible();
  });

  it("presents frontmatter as metadata rather than body text", () => {
    renderEditor({
      document: {
        path: "notes/meta.md",
        content:
          '---\ntitle: "Meta"\ncontext: "What this note is about."\n---\n\n# Meta\n',
        diagnostics: [],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Reading" }));

    const metadata = screen.getByLabelText("Note metadata");
    expect(metadata).toHaveTextContent("context");
    expect(metadata).toHaveTextContent("What this note is about.");
    expect(within(metadata).getByText("title")).toBeVisible();
    expect(screen.queryByText('title: "Meta"')).not.toBeInTheDocument();
  });

  it("opens the target note from a wiki link", () => {
    const onOpenNote = vi.fn();
    renderEditor({
      document: {
        path: "notes/links.md",
        content: "# Links\n\nSee [[Beta]].\n",
        diagnostics: [],
      },
      onOpenNote,
    });
    fireEvent.click(screen.getByRole("button", { name: "Reading" }));

    fireEvent.click(screen.getByRole("button", { name: "Beta" }));

    expect(onOpenNote).toHaveBeenCalledWith("Beta");
  });

  it("renders raw HTML in a note as text, never as markup", () => {
    renderEditor({
      document: {
        path: "notes/html.md",
        content: "# Safe\n\n<img src=x onerror=alert(1)> and <b>not bold</b>\n",
        diagnostics: [],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Reading" }));

    const rendered = screen.getByRole("article", { name: "Rendered note" });
    expect(rendered.querySelector("img")).toBeNull();
    expect(rendered.querySelector("b")).toBeNull();
    expect(rendered).toHaveTextContent("<b>not bold</b>");
  });

  it("keeps unsaved edits when switching between Source and Reading", () => {
    const { getView } = renderEditor();
    act(() => {
      getView()?.dispatch({
        changes: {
          from: note.content.length,
          insert: "\nA fresh unsaved line.\n",
        },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Reading" }));
    expect(
      screen.getByRole("article", { name: "Rendered note" }),
    ).toHaveTextContent("A fresh unsaved line.");

    fireEvent.click(screen.getByRole("button", { name: "Source" }));

    expect(
      screen.getByRole("textbox", { name: "Edit notes/alpha.md" }),
    ).toHaveTextContent("A fresh unsaved line.");
    expect(screen.getByRole("button", { name: "Save note" })).toBeEnabled();
  });
});
