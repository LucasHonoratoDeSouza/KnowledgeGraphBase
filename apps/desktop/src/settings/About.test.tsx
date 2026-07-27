import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { About, type AboutClient, type AppInfo } from "./About";

const LOG_PATH =
  "/home/user/.local/share/dev.knowledge-os.desktop/knowledge-os-desktop.log";

function stubClient(overrides: Partial<AboutClient> = {}): AboutClient {
  return {
    getLogPath: () => Promise.resolve(LOG_PATH),
    getAppInfo: () =>
      Promise.resolve({
        version: "0.2.0",
        channel: "stable",
        updateStatus: { status: "idle" },
      }),
    restart: () => Promise.resolve(),
    ...overrides,
  };
}

function appInfo(overrides: Partial<AppInfo> = {}): AppInfo {
  return {
    version: "0.2.0",
    channel: "stable",
    updateStatus: { status: "idle" },
    ...overrides,
  };
}

describe("About", () => {
  it("displays the resolved log path and copies it on request", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<About client={stubClient()} />);

    await waitFor(() =>
      expect(screen.getByText(/knowledge-os-desktop\.log/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy log path" }));

    expect(writeText).toHaveBeenCalledWith(LOG_PATH);
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });

  it("disables the copy action while the log path has not resolved yet", () => {
    render(
      <About
        client={stubClient({ getLogPath: () => new Promise(() => {}) })}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Copy log path" }),
    ).toBeDisabled();
  });

  it("displays the current version and channel from get_app_info", async () => {
    render(
      <About
        client={stubClient({
          getAppInfo: () =>
            Promise.resolve(appInfo({ version: "0.3.1", channel: "dev" })),
        })}
      />,
    );

    expect(
      await screen.findByText("Version 0.3.1 · dev channel"),
    ).toBeInTheDocument();
  });

  it("renders a non-modal, non-blocking pending-restart indicator with a working Restart now action", async () => {
    const restart = vi.fn().mockResolvedValue(undefined);
    render(
      <About
        client={stubClient({
          getAppInfo: () =>
            Promise.resolve(
              appInfo({ updateStatus: { status: "pending_restart" } }),
            ),
          restart,
        })}
      />,
    );

    const indicator = await screen.findByRole("status");
    expect(indicator).toHaveTextContent("An update has been installed.");

    // Non-modal: no dialog role, no aria-modal anywhere in the output --
    // the rest of Settings stays interactive (MVP-48 AC1).
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Restart now" }));
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("surfaces a repeated update failure's message", async () => {
    render(
      <About
        client={stubClient({
          getAppInfo: () =>
            Promise.resolve(
              appInfo({
                updateStatus: {
                  status: "failed",
                  message: "network timeout contacting release feed",
                },
              }),
            ),
        })}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Update failed: network timeout contacting release feed",
    );
  });
});
