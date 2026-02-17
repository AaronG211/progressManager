import { flattenVisibleRows, hasNoSearchResults } from "@/lib/stage1/board-view";
import type { StageOneGroup } from "@/lib/stage1/types";
import { describe, expect, it } from "vitest";

const groupsFixture: StageOneGroup[] = [
  {
    id: "group-backlog",
    name: "Backlog",
    position: 0,
    isCollapsed: false,
    items: [
      {
        id: "item-1",
        groupId: "group-backlog",
        name: "First item",
        position: 0,
        lastEditedById: null,
        values: [],
      },
      {
        id: "item-2",
        groupId: "group-backlog",
        name: "Second item",
        position: 1,
        lastEditedById: null,
        values: [],
      },
    ],
  },
  {
    id: "group-collapsed",
    name: "Collapsed",
    position: 1,
    isCollapsed: true,
    items: [
      {
        id: "item-3",
        groupId: "group-collapsed",
        name: "Hidden item",
        position: 0,
        lastEditedById: null,
        values: [],
      },
    ],
  },
];

describe("flattenVisibleRows", () => {
  it("returns rows from expanded groups only", () => {
    const rows = flattenVisibleRows(groupsFixture);
    expect(rows.map((row) => row.id)).toEqual(["item-1", "item-2"]);
  });
});

describe("hasNoSearchResults", () => {
  it("returns true when search has text and filtered groups are empty", () => {
    expect(hasNoSearchResults([], "task")).toBe(true);
  });

  it("returns false when search is empty or groups exist", () => {
    expect(hasNoSearchResults([], "   ")).toBe(false);
    expect(hasNoSearchResults(groupsFixture, "task")).toBe(false);
  });
});
