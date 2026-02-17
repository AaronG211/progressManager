import { getNextGridPosition, isGridArrowKey } from "@/lib/stage1/grid-navigation";
import { describe, expect, it } from "vitest";

describe("isGridArrowKey", () => {
  it("returns true for supported arrow keys", () => {
    expect(isGridArrowKey("ArrowUp")).toBe(true);
    expect(isGridArrowKey("ArrowDown")).toBe(true);
    expect(isGridArrowKey("ArrowLeft")).toBe(true);
    expect(isGridArrowKey("ArrowRight")).toBe(true);
  });

  it("returns false for non-arrow keys", () => {
    expect(isGridArrowKey("Enter")).toBe(false);
    expect(isGridArrowKey("a")).toBe(false);
  });
});

describe("getNextGridPosition", () => {
  it("moves within bounds", () => {
    expect(getNextGridPosition({ row: 1, col: 1 }, "ArrowUp", 3, 4)).toEqual({ row: 0, col: 1 });
    expect(getNextGridPosition({ row: 1, col: 1 }, "ArrowDown", 3, 4)).toEqual({
      row: 2,
      col: 1,
    });
    expect(getNextGridPosition({ row: 1, col: 1 }, "ArrowLeft", 3, 4)).toEqual({
      row: 1,
      col: 0,
    });
    expect(getNextGridPosition({ row: 1, col: 1 }, "ArrowRight", 3, 4)).toEqual({
      row: 1,
      col: 2,
    });
  });

  it("returns null when movement would stay at boundary", () => {
    expect(getNextGridPosition({ row: 0, col: 0 }, "ArrowUp", 3, 4)).toBeNull();
    expect(getNextGridPosition({ row: 0, col: 0 }, "ArrowLeft", 3, 4)).toBeNull();
    expect(getNextGridPosition({ row: 2, col: 3 }, "ArrowDown", 3, 4)).toBeNull();
    expect(getNextGridPosition({ row: 2, col: 3 }, "ArrowRight", 3, 4)).toBeNull();
  });

  it("returns null for empty grid dimensions", () => {
    expect(getNextGridPosition({ row: 0, col: 0 }, "ArrowRight", 0, 4)).toBeNull();
    expect(getNextGridPosition({ row: 0, col: 0 }, "ArrowDown", 3, 0)).toBeNull();
  });
});
