import { expect, test, type Page } from "@playwright/test";

async function createLocalKnowledgeBase(page: Page, name = "teste n1") {
  await page.goto("/");
  await page.getByRole("button", { name: "Choose location" }).click();
  await page.getByRole("textbox", { name: "Vault name" }).fill(name);
  await page.getByRole("button", { name: "Continue without account" }).click();
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("tablist", { name: "Primary mode" }),
  ).toBeVisible();
}

test("captures a source and finds it again through search", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);

  await page
    .getByRole("textbox", { name: "Add knowledge" })
    .fill("Notes about retrieval-augmented generation and grounded agents.");
  await page.getByRole("button", { name: "Process source" }).click();
  await expect(page.getByText(/Saved · Inbox\//)).toBeVisible();

  await page.getByRole("tab", { name: "Retrieve" }).click();
  await page
    .getByRole("textbox", { name: "Filter knowledge" })
    .fill("retrieval-augmented");
  await page
    .getByRole("textbox", { name: "Filter knowledge" })
    .press("Enter");

  await expect(
    page
      .locator('[aria-label="Search results"]')
      .getByRole("button", { name: "Quick capture" }),
  ).toBeVisible();
});

test("gates the assistant closed until a healthy model is configured", async ({
  page,
}) => {
  await createLocalKnowledgeBase(page);
  await page.getByRole("tab", { name: "Retrieve" }).click();

  await expect(page.getByText("Read-only")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Assistant model" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("option", { name: "No model configured" }),
  ).toBeAttached();
  await expect(
    page.getByRole("button", { name: "Send question" }),
  ).toBeDisabled();
});
