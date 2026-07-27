import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { About, type AboutClient } from "./About";

function stubClient(overrides: Partial<AboutClient> = {}): AboutClient {
  return {
    getLogPath: () =>
      Promise.resolve(
        "/home/user/.local/share/dev.knowledge-os.desktop/knowledge-os-desktop.log",
      ),
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

    expect(writeText).toHaveBeenCalledWith(
      "/home/user/.local/share/dev.knowledge-os.desktop/knowledge-os-desktop.log",
    );
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
});
