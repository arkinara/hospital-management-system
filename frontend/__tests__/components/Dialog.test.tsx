import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, ConfirmDialog } from "@/components/ui";
import { renderIcon } from "./testUtils";

describe("Dialog", () => {
  it("renders an accessible modal with its title", () => {
    render(
      <Dialog open title="Edit patient" onClose={() => {}} renderIcon={renderIcon}>
        <p>Body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Edit patient");
  });

  it("renders nothing when closed", () => {
    render(
      <Dialog open={false} title="Edit patient" onClose={() => {}} renderIcon={renderIcon}>
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Edit patient" onClose={onClose} renderIcon={renderIcon}>
        <p>Body</p>
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on scrim click when the form is clean", () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Edit patient" onClose={onClose} renderIcon={renderIcon}>
        <p>Body</p>
      </Dialog>,
    );
    fireEvent.click(screen.getByTestId("dialog-scrim"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks before discarding a dirty form instead of closing", () => {
    const onClose = vi.fn();
    const onRequestDiscard = vi.fn();
    render(
      <Dialog
        open
        title="Edit patient"
        onClose={onClose}
        isDirty={() => true}
        onRequestDiscard={onRequestDiscard}
        renderIcon={renderIcon}
      >
        <p>Body</p>
      </Dialog>,
    );
    fireEvent.click(screen.getByTestId("dialog-scrim"));
    expect(onRequestDiscard).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("returns focus to the trigger on close", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Dialog open={open} title="Edit" onClose={() => setOpen(false)} renderIcon={renderIcon}>
            <p>Body</p>
          </Dialog>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the dialog open when an action returns false", () => {
    const onClose = vi.fn();
    render(
      <Dialog
        open
        title="Edit"
        onClose={onClose}
        renderIcon={renderIcon}
        actions={[{ label: "Save", onAction: () => false }]}
      >
        <p>Body</p>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ConfirmDialog", () => {
  it("renders consequences as bullets and confirms destructively", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete record"
        message="This cannot be undone."
        consequences={["The record is voided.", "The audit entry is kept."]}
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onClose={() => {}}
        renderIcon={renderIcon}
      />,
    );
    expect(screen.getByText("The record is voided.")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Delete" });
    expect(confirm.className).toContain("bg-danger");
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
