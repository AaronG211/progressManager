import { StageZeroHome } from "@/components/shell/stage-zero-home";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("stage zero home", () => {
  it("renders command palette trigger", () => {
    render(<StageZeroHome />);

    expect(screen.getByRole("button", { name: /command palette/i })).toBeInTheDocument();
  });
});
