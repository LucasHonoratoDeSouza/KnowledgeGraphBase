import { beforeEach, describe, expect, it, vi } from "vitest";

const open = vi.hoisted(() => vi.fn());
const homeDir = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir }));

import { tauriFolderPicker } from "./folderPicker";

describe("native folder picker port", () => {
  beforeEach(() => {
    open.mockReset();
    homeDir.mockReset();
    homeDir.mockResolvedValue("/home/user");
  });

  it("requests only one directory for a new vault parent, starting from home", async () => {
    open.mockResolvedValue("/canonical/parent");

    await expect(tauriFolderPicker.chooseParentLocation()).resolves.toBe(
      "/canonical/parent",
    );
    expect(open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      defaultPath: "/home/user",
    });
  });

  it("preserves native cancellation as an unchanged null selection", async () => {
    open.mockResolvedValue(null);

    await expect(tauriFolderPicker.chooseExistingVault()).resolves.toBeNull();
    expect(open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      defaultPath: "/home/user",
    });
  });

  it("still opens the picker when the home directory cannot be resolved", async () => {
    homeDir.mockRejectedValue(new Error("unavailable"));
    open.mockResolvedValue("/canonical/parent");

    await expect(tauriFolderPicker.chooseParentLocation()).resolves.toBe(
      "/canonical/parent",
    );
    expect(open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
    });
  });
});
