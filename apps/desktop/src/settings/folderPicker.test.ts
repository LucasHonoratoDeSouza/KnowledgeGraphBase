import { beforeEach, describe, expect, it, vi } from "vitest";

const open = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));

import { tauriFolderPicker } from "./folderPicker";

describe("native folder picker port", () => {
  beforeEach(() => open.mockReset());

  it("requests only one directory for a new vault parent", async () => {
    open.mockResolvedValue("/canonical/parent");

    await expect(tauriFolderPicker.chooseParentLocation()).resolves.toBe(
      "/canonical/parent",
    );
    expect(open).toHaveBeenCalledWith({ directory: true, multiple: false });
  });

  it("preserves native cancellation as an unchanged null selection", async () => {
    open.mockResolvedValue(null);

    await expect(tauriFolderPicker.chooseExistingVault()).resolves.toBeNull();
    expect(open).toHaveBeenCalledWith({ directory: true, multiple: false });
  });
});
