import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VaultCompatibilityNotice } from "./VaultCompatibilityNotice";

describe("VaultCompatibilityNotice", () => {
  it("renders an observable, non-modal progress indicator during a simulated rebuild", () => {
    render(<VaultCompatibilityNotice status={{ kind: "rebuilding" }} />);

    // Observable: a status region with visible text.
    expect(screen.getByRole("status")).toHaveTextContent(
      "Preparing your vault",
    );

    // Not a frozen window: no dialog role, no aria-modal anywhere in the
    // rendered output -- the rest of the app stays interactive.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
  });

  it("renders nothing once the vault is ready", () => {
    const { container } = render(
      <VaultCompatibilityNotice status={{ kind: "ready" }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("surfaces the refusal message when the vault is newer than this binary", () => {
    render(
      <VaultCompatibilityNotice
        status={{
          kind: "refused",
          message:
            "This vault was last opened by a newer version of Knowledge OS.",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This vault was last opened by a newer version of Knowledge OS.",
    );
  });
});
