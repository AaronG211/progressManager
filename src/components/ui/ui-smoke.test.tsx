import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalTitle,
  ModalTrigger,
} from "@/components/ui/modal";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

describe("ui primitives smoke", () => {
  it("renders button and input", async () => {
    render(
      <div>
        <Button>Save</Button>
        <Input aria-label="workspace" defaultValue="Launch Ops" />
      </div>,
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByLabelText("workspace")).toHaveValue("Launch Ops");
  });

  it("opens and closes modal via keyboard", async () => {
    const user = userEvent.setup();

    render(
      <Modal>
        <ModalTrigger asChild>
          <Button>Open modal</Button>
        </ModalTrigger>
        <ModalContent>
          <ModalTitle>Example modal</ModalTitle>
          <ModalDescription>Keyboard behavior smoke test.</ModalDescription>
        </ModalContent>
      </Modal>,
    );

    await user.click(screen.getByRole("button", { name: "Open modal" }));
    expect(screen.getByText("Example modal")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Example modal")).not.toBeInTheDocument();
  });
});
