import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui";
import { renderIcon } from "./testUtils";

describe("Button", () => {
  it("renders its children and forwards the click", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies variant and size classes", () => {
    render(
      <Button variant="primary" size="lg">
        Primary
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Primary" });
    expect(button.className).toContain("bg-primary");
    expect(button.className).toContain("min-h-12");
  });

  it("disables itself and sets aria-busy while loading", () => {
    render(
      <Button loading loadingLabel="Saving…">
        Save
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });

  it("is non-interactive when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Nope" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("uses label as the accessible name for an icon-only button", () => {
    render(<Button variant="ghost" label="Search" icon={renderIcon("search", "h-4 w-4")} />);
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });

  it("keeps a 44px hit height at the default size", () => {
    render(<Button>Default</Button>);
    expect(screen.getByRole("button").className).toContain("min-h-11");
  });
});
