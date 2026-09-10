import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StateRegion, StateSwitch, EmptyState, ErrorState } from "@/components/ui";
import { renderIcon } from "./testUtils";

const region = (state: "ready" | "loading" | "empty" | "error") => (
  <StateRegion
    state={state}
    ready={<p>Ready content</p>}
    loading={<p>Loading content</p>}
    empty={<p>Empty content</p>}
    error={<p>Error content</p>}
  />
);

describe("StateRegion", () => {
  it("renders only the active state", () => {
    const { rerender } = render(region("ready"));
    expect(screen.getByText("Ready content")).toBeInTheDocument();
    expect(screen.queryByText("Empty content")).not.toBeInTheDocument();

    rerender(region("loading"));
    expect(screen.getByText("Loading content")).toBeInTheDocument();
    expect(screen.queryByText("Ready content")).not.toBeInTheDocument();

    rerender(region("empty"));
    expect(screen.getByText("Empty content")).toBeInTheDocument();

    rerender(region("error"));
    expect(screen.getByText("Error content")).toBeInTheDocument();
  });

  it("falls back to skeleton rows while loading", () => {
    render(
      <StateRegion
        state="loading"
        ready={<p>Ready</p>}
        empty={<p>Empty</p>}
        error={<p>Error</p>}
      />,
    );
    // SkeletonRows renders an aria-hidden container of shimmer blocks.
    expect(document.querySelectorAll(".skel").length).toBeGreaterThan(0);
  });
});

describe("EmptyState / ErrorState", () => {
  it("names the cause and offers a next action", () => {
    render(
      <EmptyState
        title="No patient matches these filters"
        body="Clear the filter or search by MRN."
        renderIcon={renderIcon}
      />,
    );
    expect(screen.getByText("No patient matches these filters")).toBeInTheDocument();
    expect(screen.getByText("Clear the filter or search by MRN.")).toBeInTheDocument();
  });

  it("announces an error and exposes a trace id and retry", () => {
    const onRetry = vi.fn();
    render(<ErrorState traceId="abc123" onRetry={onRetry} renderIcon={renderIcon} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("StateSwitch", () => {
  it("marks the active state and reports changes", () => {
    const onChange = vi.fn();
    render(<StateSwitch state="ready" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "ready" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "empty" }));
    expect(onChange).toHaveBeenCalledWith("empty");
  });
});
