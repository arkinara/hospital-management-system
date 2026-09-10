import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusChip, AcuityBadge, STATUS } from "@/components/ui";
import { renderIcon } from "./testUtils";

describe("StatusChip", () => {
  it("renders the status label and its glyph", () => {
    render(<StatusChip status="paid" renderIcon={renderIcon} />);
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByTestId(`icon-${STATUS.paid.icon}`)).toBeInTheDocument();
  });

  it("allows the wording to be overridden without changing the tone", () => {
    render(<StatusChip status="unpaid" label="Outstanding" renderIcon={renderIcon} />);
    expect(screen.getByText("Outstanding")).toBeInTheDocument();
  });

  it("applies the tone container classes", () => {
    render(<StatusChip status="cancelled" renderIcon={renderIcon} />);
    const chip = screen.getByText("Cancelled").parentElement;
    expect(chip?.className).toContain("bg-danger-container");
  });

  it("renders the small size", () => {
    render(<StatusChip status="booked" size="sm" renderIcon={renderIcon} />);
    expect(screen.getByText("Booked").parentElement?.className).toContain("text-2xs");
  });
});

describe("AcuityBadge", () => {
  it("renders each ordered step with its own glyph", () => {
    render(
      <>
        <AcuityBadge acuity="critical" renderIcon={renderIcon} />
        <AcuityBadge acuity="routine" renderIcon={renderIcon} />
      </>,
    );
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Routine")).toBeInTheDocument();
    expect(screen.getByTestId("icon-siren")).toBeInTheDocument();
    expect(screen.getByTestId("icon-circle-dot")).toBeInTheDocument();
  });
});
