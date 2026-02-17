import { filterGroupsByItemName, getStatusOptions } from "@/lib/stage1/search";
import type { StageOneGroup } from "@/lib/stage1/types";
import { describe, expect, it } from "vitest";

const groupsFixture: StageOneGroup[] = [
  {
    id: "g1",
    name: "Backlog",
    position: 0,
    isCollapsed: false,
    items: [
      {
        id: "i1",
        groupId: "g1",
        name: "Design board UI",
        position: 0,
        lastEditedById: null,
        values: [],
      },
      {
        id: "i2",
        groupId: "g1",
        name: "Write migrations",
        position: 1,
        lastEditedById: null,
        values: [],
      },
    ],
  },
  {
    id: "g2",
    name: "Done",
    position: 1,
    isCollapsed: false,
    items: [
      {
        id: "i3",
        groupId: "g2",
        name: "Ship Stage 0",
        position: 0,
        lastEditedById: null,
        values: [],
      },
    ],
  },
];

describe("stage1 search utilities", () => {
  it("uses default status options when none are provided", () => {
    const options = getStatusOptions(undefined);
    expect(options.length).toBeGreaterThanOrEqual(4);
    expect(options[0].label).toBe("Not Started");
  });

  it("filters groups by item name", () => {
    const filtered = filterGroupsByItemName(groupsFixture, "design");

    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Backlog");
    expect(filtered[0].items).toHaveLength(1);
    expect(filtered[0].items[0].name).toContain("Design");
  });

  it("returns original groups when query is empty", () => {
    const filtered = filterGroupsByItemName(groupsFixture, "   ");
    expect(filtered).toEqual(groupsFixture);
  });
});
