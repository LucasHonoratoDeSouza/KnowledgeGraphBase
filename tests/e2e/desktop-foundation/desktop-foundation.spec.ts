import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function createLocalKnowledgeBase(page: Page, name = "teste n1") {
  await page.goto("/");
  await page.getByRole("button", { name: "Choose location" }).click();
  await expect(
    page.getByRole("textbox", { name: "Parent location" }),
  ).toHaveValue("/tmp/knowledge-os-e2e");
  await page.getByRole("textbox", { name: "Vault name" }).fill(name);
  await page.getByRole("button", { name: "Continue without account" }).click();
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("tablist", { name: "Primary mode" }),
  ).toBeVisible();
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(
    page.getByRole("heading", { name: "AI Settings" }),
  ).toBeVisible();
}

test("offers explicit accountless local knowledge-base creation", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "Continue without account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Create local knowledge base" }),
  ).toBeChecked();
  await expect(
    page.getByRole("textbox", { name: "Parent location" }),
  ).toHaveAttribute("readonly");
  await createLocalKnowledgeBase(page);
  await expect(page.getByRole("tab", { name: "Ingest" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("opens an existing vault through the injected directory chooser", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "Open existing vault" }).click();
  await page.getByRole("button", { name: "Choose existing vault" }).click();

  await expect(
    page.getByRole("textbox", { name: "Existing vault path" }),
  ).toHaveValue("/tmp/Existing Vault");
  await expect(
    page.getByRole("textbox", { name: "Existing vault path" }),
  ).toHaveAttribute("readonly");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("tablist", { name: "Primary mode" }),
  ).toBeVisible();
});

test("reports a colliding new-vault target without opening a partial workspace", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Choose location" }).click();
  await page.getByRole("textbox", { name: "Vault name" }).fill("Existing");
  await page.getByRole("button", { name: "Open workspace" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "A vault already exists at the requested location",
  );
  await expect(page.getByRole("tablist", { name: "Primary mode" })).toHaveCount(
    0,
  );
});

test("local setup performs no provider or external network call", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4317")) {
      externalRequests.push(request.url());
    }
  });

  await createLocalKnowledgeBase(page);

  expect(externalRequests).toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("knowledge-os:e2e:provider-call-count"),
      ),
    )
    .toBeNull();
});

test("exposes exactly the Ingest and Retrieve primary modes", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);

  await expect(
    page.getByRole("tablist", { name: "Primary mode" }).getByRole("tab"),
  ).toHaveText(["Ingest", "Retrieve"]);
});

test("switches primary modes with arrow-key focus semantics", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);
  const ingest = page.getByRole("tab", { name: "Ingest" });
  await ingest.focus();
  await ingest.press("ArrowRight");

  const retrieve = page.getByRole("tab", { name: "Retrieve" });
  await expect(retrieve).toBeFocused();
  await expect(retrieve).toHaveAttribute("aria-selected", "true");
});

test("keeps Ingest sparse and focused on one composer", async ({ page }) => {
  await createLocalKnowledgeBase(page);

  await expect(
    page.getByRole("textbox", { name: "Add knowledge" }),
  ).toBeVisible();
  await expect(page.locator("[data-ui='dashboard-card']")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Explorer" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Capture a source" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Attach files" }),
  ).toBeVisible();
});

test("uses a flat retro desktop visual system and the teste n1 review vault", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".onboarding-gate")).toHaveCSS(
    "background-image",
    "none",
  );

  await createLocalKnowledgeBase(page);
  await expect(page.locator(".ingest-surface")).toHaveCSS(
    "background-image",
    "none",
  );
  await expect(page.locator(".composer-submit")).toHaveCSS(
    "box-shadow",
    "none",
  );

  await page.getByRole("tab", { name: "Retrieve" }).click();
  await expect(page.getByText("teste n1", { exact: true })).toBeVisible();
  const explorer = page.getByRole("region", { name: "Explorer" });
  await expect(
    explorer.getByText("Knowledge OS", { exact: true }),
  ).toBeVisible();
  await expect(
    explorer.getByText("AI Research", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".graph-stage")).toHaveCSS(
    "background-image",
    "none",
  );
  const graphSurfaceColors = await page
    .locator(".graph-heading, .graph-stage")
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).backgroundColor),
    );
  expect(new Set(graphSurfaceColors).size).toBe(1);
  expect(graphSurfaceColors[0]).toBe("rgb(31, 31, 31)");
  await expect(page.locator(".graph-node-glow")).toHaveCount(0);
});

test("renders the durable three-pane Retrieve workspace", async ({ page }) => {
  await createLocalKnowledgeBase(page);
  await page.getByRole("tab", { name: "Retrieve" }).click();

  await expect(page.getByRole("region", { name: "Explorer" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Knowledge canvas" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Assistant" })).toBeVisible();
  await expect(
    page.getByRole("tablist", { name: "Canvas tabs" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Graph view" })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Assistant model" }),
  ).toBeVisible();
});

test("keeps graph drag, connected motion, pan and zoom fluid", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);
  await page.getByRole("tab", { name: "Retrieve" }).click();

  const graph = page.getByRole("img", { name: "Knowledge graph" });
  const stage = page.locator(".graph-stage");
  const dragged = graph.locator('[data-graph-node="document-knowledge-os"]');
  const neighbor = graph.locator('[data-graph-node="document-ai-research"]');
  await expect(dragged).toBeVisible();
  await expect(neighbor).toBeVisible();
  await expect(graph.locator(".graph-edge-layer line")).toHaveCount(1);
  await expect(stage).toHaveCSS("user-select", "none");
  await expect(stage).toHaveCSS("touch-action", "none");
  const controlIconsFit = await page
    .getByLabel("Graph view controls")
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const icon = button.querySelector("svg");
        if (!icon) return false;
        const buttonBounds = button.getBoundingClientRect();
        const iconBounds = icon.getBoundingClientRect();
        return (
          iconBounds.width <= buttonBounds.width &&
          iconBounds.height <= buttonBounds.height &&
          iconBounds.left >= buttonBounds.left &&
          iconBounds.right <= buttonBounds.right
        );
      }),
    );
  expect(controlIconsFit).toEqual([true, true, true]);

  await expect
    .poll(async () => {
      const first = await neighbor.evaluate((element) => ({
        x: Number((element as SVGGElement).dataset.graphX),
        y: Number((element as SVGGElement).dataset.graphY),
      }));
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                resolve();
              });
            });
          }),
      );
      const second = await neighbor.evaluate((element) => ({
        x: Number((element as SVGGElement).dataset.graphX),
        y: Number((element as SVGGElement).dataset.graphY),
      }));
      return Math.hypot(second.x - first.x, second.y - first.y);
    })
    .toBeLessThan(0.05);
  const draggedBefore = await dragged.evaluate((element) => ({
    x: Number((element as SVGGElement).dataset.graphX),
    y: Number((element as SVGGElement).dataset.graphY),
  }));
  const before = await neighbor.evaluate((element) => ({
    x: Number((element as SVGGElement).dataset.graphX),
    y: Number((element as SVGGElement).dataset.graphY),
  }));
  const circle = await dragged.locator("circle").boundingBox();
  const graphBox = await graph.boundingBox();
  if (!circle || !graphBox) throw new Error("graph node has no bounding box");
  const start = {
    x: circle.x + circle.width / 2,
    y: circle.y + circle.height / 2,
  };
  const horizontalMove = start.x < graphBox.x + graphBox.width / 2 ? 150 : -150;

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + horizontalMove, start.y + 24, { steps: 10 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
  const during = await neighbor.evaluate((element) => ({
    x: Number((element as SVGGElement).dataset.graphX),
    y: Number((element as SVGGElement).dataset.graphY),
  }));
  const draggedDuring = await dragged.evaluate((element) => ({
    x: Number((element as SVGGElement).dataset.graphX),
    y: Number((element as SVGGElement).dataset.graphY),
  }));
  await page.mouse.up();

  expect(
    Math.hypot(
      draggedDuring.x - draggedBefore.x,
      draggedDuring.y - draggedBefore.y,
    ),
  ).toBeGreaterThan(50);
  expect(Math.hypot(during.x - before.x, during.y - before.y)).toBeGreaterThan(
    0.25,
  );
  expect(
    await page.evaluate(() => window.getSelection()?.toString() ?? ""),
  ).toBe("");

  const labelBox = await dragged.locator("text").boundingBox();
  if (!labelBox) throw new Error("graph label has no bounding box");
  await page.mouse.move(labelBox.x + 2, labelBox.y + labelBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    labelBox.x + Math.max(12, labelBox.width - 2),
    labelBox.y + labelBox.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.getSelection()?.toString() ?? ""),
  ).toBe("");

  const scaleBefore = Number(await graph.getAttribute("data-graph-scale"));
  await page.mouse.move(graphBox.x + graphBox.width * 0.3, graphBox.y + 80);
  await page.mouse.wheel(0, -360);
  await expect
    .poll(async () => Number(await graph.getAttribute("data-graph-scale")))
    .toBeGreaterThan(scaleBefore);

  await page.getByRole("button", { name: "Reset graph view" }).click();
  await expect(graph).toHaveAttribute("viewBox", "0 0 800 520");
  await page.mouse.move(graphBox.x + 24, graphBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(graphBox.x + 84, graphBox.y + 54, { steps: 5 });
  await page.mouse.up();
  await expect(graph).not.toHaveAttribute("viewBox", "0 0 800 520");
  expect(
    await page.evaluate(() => window.getSelection()?.toString() ?? ""),
  ).toBe("");
});

test("restores a collapsed Explorer and active mode after restart", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);
  await page.getByRole("tab", { name: "Retrieve" }).click();
  await page.getByRole("button", { name: "Hide Explorer" }).click();
  await expect(page.getByRole("region", { name: "Explorer" })).toHaveCount(0);

  await page.reload();

  await expect(page.getByRole("tab", { name: "Retrieve" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Show Explorer" }),
  ).toBeVisible();
});

test("restores a resized Explorer after restart", async ({ page }) => {
  await createLocalKnowledgeBase(page);
  await page.getByRole("tab", { name: "Retrieve" }).click();
  await page.getByRole("button", { name: "Widen Explorer" }).click();
  await expect(page.locator(".retrieve-workspace")).toHaveCSS(
    "grid-template-columns",
    /280px/,
  );

  await page.reload();

  await expect(page.locator(".retrieve-workspace")).toHaveCSS(
    "grid-template-columns",
    /280px/,
  );
});

test("opens and executes the keyboard command palette", async ({ page }) => {
  await createLocalKnowledgeBase(page);
  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("Open Graph");
  await palette.getByRole("combobox").press("Enter");

  await expect(palette).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Retrieve" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("keeps AI settings sections navigable and distinct", async ({ page }) => {
  await createLocalKnowledgeBase(page);
  await openSettings(page);

  await expect(
    page.getByRole("navigation", { name: "AI settings" }).getByRole("link"),
  ).toHaveText([
    "AI Providers",
    "Models & Routing",
    "Costs & Usage",
    "Privacy",
  ]);
});

test("supports masked provider connect, test, rotate and remove lifecycle", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);
  await openSettings(page);
  const openAi = page.getByRole("group", { name: "OpenAI connection" });
  const key = openAi.getByLabel("New OpenAI key");
  await key.fill("never-persist-this-secret");
  await openAi.getByRole("button", { name: "Connect OpenAI" }).click();
  await expect(openAi.getByText("Configured ••••••••")).toBeVisible();
  await expect(key).toHaveValue("");

  await openAi.getByRole("button", { name: "Test OpenAI" }).click();
  await expect(openAi.getByText("Health: healthy")).toBeVisible();
  await key.fill("rotated-transient-secret");
  await openAi.getByRole("button", { name: "Rotate OpenAI key" }).click();
  await expect(key).toHaveValue("");
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storage).not.toContain("never-persist-this-secret");
  expect(storage).not.toContain("rotated-transient-secret");

  await openAi.getByRole("button", { name: "Remove OpenAI" }).click();
  await expect(openAi.getByText("Not configured")).toBeVisible();
});

test("keeps OpenAI, Anthropic, DeepSeek and Groq provider state independent", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);
  await openSettings(page);

  for (const provider of ["OpenAI", "Anthropic", "DeepSeek", "Groq"] as const) {
    const group = page.getByRole("group", { name: `${provider} connection` });
    await group.getByLabel(`New ${provider} key`).fill(`${provider}-key`);
    await group.getByRole("button", { name: `Connect ${provider}` }).click();
    await expect(group.getByText("Configured ••••••••")).toBeVisible();
  }
});

test("persists an edited Markdown note across an offline restart", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);
  await page.getByRole("tab", { name: "Retrieve" }).click();
  await page.getByRole("tab", { name: "Welcome.md" }).click();
  const editor = page.getByRole("textbox", { name: "Edit notes/Welcome.md" });
  await editor.fill("# Offline note\n\nLinks to [[Research]].\n");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(
    page.getByRole("status", { name: "" }).filter({ hasText: "Saved" }),
  ).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem("knowledge-os:e2e:offline", "true"),
  );

  await page.reload();

  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Retrieve" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Welcome.md" }).click();
  await expect(
    page.getByRole("textbox", { name: "Edit notes/Welcome.md" }),
  ).toContainText("Offline note");
});

test("creates a named note and folder from the Explorer header", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);
  await page.getByRole("tab", { name: "Retrieve" }).click();
  const explorer = page.getByRole("region", { name: "Explorer" });

  await explorer.getByRole("button", { name: "New folder" }).click();
  const folderName = explorer.getByRole("textbox", { name: "New folder name" });
  await folderName.fill("Reading list");
  await folderName.press("Enter");
  await expect(
    explorer.getByRole("button", { name: "Reading list" }),
  ).toBeVisible();

  await explorer.getByRole("button", { name: "New note" }).click();
  const noteName = explorer.getByRole("textbox", { name: "New note name" });
  await noteName.fill("Field notes");
  await noteName.press("Enter");

  await expect(page.getByRole("tab", { name: "Field notes.md" })).toBeVisible();
  await expect(
    explorer.getByRole("button", { name: "Field notes" }),
  ).toBeVisible();
});

test("collapses an Explorer folder and keeps it collapsed after restart", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);
  await page.getByRole("tab", { name: "Retrieve" }).click();
  const explorer = page.getByRole("region", { name: "Explorer" });
  await expect(
    explorer.getByRole("button", { name: "Knowledge OS" }),
  ).toBeVisible();

  await explorer.getByRole("button", { name: "Projects" }).click();
  await expect(
    explorer.getByRole("button", { name: "Knowledge OS" }),
  ).toHaveCount(0);

  await page.reload();

  await expect(
    explorer.getByRole("button", { name: "Projects" }),
  ).toBeVisible();
  await expect(
    explorer.getByRole("button", { name: "Knowledge OS" }),
  ).toHaveCount(0);

  await explorer.getByRole("button", { name: "Projects" }).click();
  await expect(
    explorer.getByRole("button", { name: "Knowledge OS" }),
  ).toBeVisible();
});

test("renames a note from the Explorer context menu", async ({ page }) => {
  await createLocalKnowledgeBase(page);
  await page.getByRole("tab", { name: "Retrieve" }).click();
  const explorer = page.getByRole("region", { name: "Explorer" });

  await explorer.getByRole("button", { name: "Knowledge OS" }).click({
    button: "right",
  });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const name = explorer.getByRole("textbox", { name: "New name" });
  await expect(name).toHaveValue("Knowledge OS");
  await name.fill("Knowledge OS rewritten");
  await name.press("Enter");

  await expect(
    explorer.getByRole("button", { name: "Knowledge OS rewritten" }),
  ).toBeVisible();
  await expect(
    explorer.getByRole("button", { name: "Knowledge OS", exact: true }),
  ).toHaveCount(0);
});

test("switches a note between source and reading views", async ({ page }) => {
  await createLocalKnowledgeBase(page);
  await page.getByRole("tab", { name: "Retrieve" }).click();
  await page.getByRole("tab", { name: "Welcome.md" }).click();
  await page
    .getByRole("textbox", { name: "Edit notes/Welcome.md" })
    .fill("# Reading check\n\nSome **bold** copy.\n");

  await page.getByRole("button", { name: "Reading" }).click();

  const rendered = page.getByRole("article", { name: "Rendered note" });
  await expect(
    rendered.getByRole("heading", { name: "Reading check" }),
  ).toBeVisible();
  await expect(rendered.getByText("bold")).toBeVisible();

  await page
    .getByRole("group", { name: "View mode" })
    .getByRole("button", { name: "Source" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Edit notes/Welcome.md" }),
  ).toContainText("Some **bold** copy.");
});

test("resizes the Explorer by dragging its divider and keeps it after restart", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);
  await page.getByRole("tab", { name: "Retrieve" }).click();
  const divider = page.getByRole("separator", { name: "Resize Explorer" });
  const box = await divider.boundingBox();
  if (!box) throw new Error("divider has no box");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();

  // The pointer lands on a sub-pixel boundary, so the exact width is not
  // predictable — what matters is that it grew past the 240px default and that
  // the same width comes back after a restart.
  const workspace = page.locator(".retrieve-workspace");
  await expect(workspace).toHaveCSS(
    "grid-template-columns",
    /^3\d\d(\.\d+)?px /,
  );
  const resized = await workspace.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns,
  );

  await page.reload();

  await expect(workspace).toHaveCSS("grid-template-columns", resized);
});

test("assistant surface stays read-only with no action or research tools", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);
  await page.getByRole("tab", { name: "Retrieve" }).click();
  const assistant = page.getByRole("region", { name: "Assistant" });

  await expect(assistant).toContainText("Read-only");
  await expect(
    assistant.getByRole("textbox", { name: "Ask your knowledge base" }),
  ).toBeVisible();
  await expect(
    assistant.getByRole("button", { name: "Send question" }),
  ).toBeDisabled();
  // Scoped to the assistant: the Explorer legitimately renders vault folders
  // as buttons, and a vault may contain a folder called "Research".
  await expect(
    assistant.getByRole("button", {
      name: /^(delete|write file|research)$/i,
    }),
  ).toHaveCount(0);
});

test("has no automated accessibility violations after setup", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);
  await page.getByRole("tab", { name: "Retrieve" }).click();

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

test("captures the four desktop-foundation owner-review states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: "artifacts/desktop-foundation/onboarding.png",
  });

  await createLocalKnowledgeBase(page);
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: "artifacts/desktop-foundation/ingest.png",
  });

  await page.getByRole("tab", { name: "Retrieve" }).click();
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: "artifacts/desktop-foundation/retrieve.png",
  });

  await openSettings(page);
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: "artifacts/desktop-foundation/ai-settings.png",
  });
});
