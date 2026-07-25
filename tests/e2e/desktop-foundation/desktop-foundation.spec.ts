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
