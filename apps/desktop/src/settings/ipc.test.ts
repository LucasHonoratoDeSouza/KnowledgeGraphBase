import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { ipcSettingsClient } from "./ipc";

describe("secure settings IPC client", () => {
  beforeEach(() => invoke.mockReset());

  it("uses a narrow write command for a transient provider credential", async () => {
    invoke.mockResolvedValue({});

    await ipcSettingsClient.connectProvider({
      provider: "openai",
      endpoint: "https://api.openai.com",
      credential: "transient-only",
    });

    expect(invoke).toHaveBeenCalledWith("provider_connect", {
      request: {
        provider: "openai",
        endpoint: "https://api.openai.com",
        credential: "transient-only",
      },
    });
  });

  it("queries only the renderer-safe settings snapshot", async () => {
    invoke.mockResolvedValue({});

    await ipcSettingsClient.getSettings();

    expect(invoke).toHaveBeenCalledWith("settings_get");
    expect(invoke.mock.calls.flat().join(" ")).not.toContain("credential_get");
    expect(invoke.mock.calls.flat().join(" ")).not.toContain("stronghold");
  });

  it("uses rotate and remove commands that never request stored plaintext", async () => {
    invoke.mockResolvedValue({});

    await ipcSettingsClient.rotateProvider("deepseek", "replacement");
    await ipcSettingsClient.removeProvider("deepseek");

    expect(invoke.mock.calls).toEqual([
      ["provider_rotate", { provider: "deepseek", credential: "replacement" }],
      ["provider_remove", { provider: "deepseek" }],
    ]);
  });
});
