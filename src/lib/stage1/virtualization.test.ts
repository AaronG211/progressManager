import { getVirtualWindow } from "@/lib/stage1/virtualization";
import { describe, expect, it } from "vitest";

describe("getVirtualWindow", () => {
  it("returns empty window for empty data", () => {
    expect(
      getVirtualWindow({
        totalCount: 0,
        scrollTop: 0,
        viewportHeight: 400,
        rowHeight: 50,
        overscan: 5,
      }),
    ).toEqual({
      startIndex: 0,
      endIndex: -1,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    });
  });

  it("calculates a bounded visible range and spacer heights", () => {
    const window = getVirtualWindow({
      totalCount: 500,
      scrollTop: 1_000,
      viewportHeight: 400,
      rowHeight: 50,
      overscan: 3,
    });

    expect(window.startIndex).toBe(17);
    expect(window.endIndex).toBe(30);
    expect(window.topSpacerHeight).toBe(850);
    expect(window.bottomSpacerHeight).toBe((500 - 31) * 50);
  });

  it("clamps to edges when near top or bottom", () => {
    expect(
      getVirtualWindow({
        totalCount: 12,
        scrollTop: 0,
        viewportHeight: 300,
        rowHeight: 50,
        overscan: 4,
      }),
    ).toEqual({
      startIndex: 0,
      endIndex: 9,
      topSpacerHeight: 0,
      bottomSpacerHeight: 100,
    });

    expect(
      getVirtualWindow({
        totalCount: 12,
        scrollTop: 10_000,
        viewportHeight: 300,
        rowHeight: 50,
        overscan: 4,
      }),
    ).toEqual({
      startIndex: 11,
      endIndex: 11,
      topSpacerHeight: 550,
      bottomSpacerHeight: 0,
    });
  });
});
