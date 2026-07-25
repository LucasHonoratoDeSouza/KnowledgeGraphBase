import { act, render, screen, waitFor } from "@testing-library/react";
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
