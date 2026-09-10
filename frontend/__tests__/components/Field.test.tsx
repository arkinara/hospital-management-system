import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Field, ErrorSummary } from "@/components/ui";
import { renderIcon } from "./testUtils";

describe("Field", () => {
  it("binds a visible label to the control", () => {
    render(<Field id="name" label="Full name" />);
    const input = screen.getByLabelText("Full name");
    expect(input).toHaveAttribute("id", "name");
  });

  it("marks required fields with visible and screen-reader text", () => {
    render(<Field id="nid" label="National ID" required />);
    expect(screen.getByText("(required)")).toBeInTheDocument();
    expect(screen.getByLabelText(/National ID/)).toBeRequired();
  });

  it("renders persistent helper text and wires aria-describedby", () => {
    render(<Field id="email" label="Email" help="We never share this." />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-describedby", "email-help");
    expect(screen.getByText("We never share this.")).toHaveAttribute("id", "email-help");
  });

  it("renders an error with role=alert and sets aria-invalid", () => {
    render(<Field id="nid" label="National ID" error="Must be exactly 16 digits" />);
    const input = screen.getByLabelText("National ID");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Must be exactly 16 digits");
    expect(input).toHaveAttribute("aria-describedby", "nid-err");
  });

  it("toggles password reveal with aria-pressed", () => {
    render(<Field id="pw" label="Password" type="password" renderIcon={renderIcon} />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    fireEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("calls onChange with the value and onBlurValidate on blur", () => {
    const onChange = vi.fn();
    const onBlurValidate = vi.fn();
    render(
      <Field
        id="q"
        label="Query"
        onChange={onChange}
        onBlurValidate={onBlurValidate}
      />,
    );
    const input = screen.getByLabelText("Query");
    fireEvent.change(input, { target: { value: "P-001042" } });
    fireEvent.blur(input, { target: { value: "P-001042" } });
    expect(onChange).toHaveBeenCalledWith("P-001042");
    expect(onBlurValidate).toHaveBeenCalledWith("P-001042");
  });
});

describe("ErrorSummary", () => {
  it("focuses itself when errors appear and links to each field", () => {
    render(
      <>
        <Field id="a" label="Field A" />
        <ErrorSummary errors={[{ id: "a", label: "Field A" }]} renderIcon={renderIcon} />
      </>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveFocus();
    fireEvent.click(screen.getByRole("link", { name: "Field A" }));
    expect(screen.getByLabelText("Field A")).toHaveFocus();
  });

  it("renders nothing when there are no errors", () => {
    const { container } = render(<ErrorSummary errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
