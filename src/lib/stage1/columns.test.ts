import { describe, expect, it } from "vitest";
import { reorderColumnsById } from "@/lib/stage1/columns";
import type { StageOneColumn } from "@/lib/stage1/types";

const BASE_COLUMNS: StageOneColumn[] = [
  {
    id: "cm0source00000000000000000",
    name: "Notes",
    type: "TEXT",
    position: 0,
    settings: null,
  },
  {
    id: "cm0target00000000000000000",
    name: "Status",
    type: "STATUS",
    position: 1,
    settings: {
      options: [{ label: "Working", color: "#2563EB" }],
    },
  },
  {
    id: "cm0person00000000000000000",
    name: "Owner",
    type: "PERSON",
    position: 2,
    settings: null,
  },
];

describe("reorderColumnsById", () => {
  it("moves a column before the drop target", () => {
    const reordered = reorderColumnsById(
      BASE_COLUMNS,
      "cm0person00000000000000000",
      "cm0source00000000000000000",
    );

    expect(reordered.map((column) => column.id)).toEqual([
      "cm0person00000000000000000",
      "cm0source00000000000000000",
      "cm0target00000000000000000",
    ]);
    expect(reordered.map((column) => column.position)).toEqual([0, 1, 2]);
  });

  it("reindexes positions after moving left-to-right", () => {
    const reordered = reorderColumnsById(
      BASE_COLUMNS,
      "cm0source00000000000000000",
      "cm0person00000000000000000",
    );

    expect(reordered.map((column) => column.id)).toEqual([
      "cm0target00000000000000000",
      "cm0source00000000000000000",
      "cm0person00000000000000000",
    ]);
    expect(reordered.map((column) => column.position)).toEqual([0, 1, 2]);
  });

  it("returns original array when ids are missing or unchanged", () => {
    const missing = reorderColumnsById(
      BASE_COLUMNS,
      "cm0missing0000000000000000",
      "cm0source00000000000000000",
    );
    const unchanged = reorderColumnsById(
      BASE_COLUMNS,
      "cm0source00000000000000000",
      "cm0source00000000000000000",
    );

    expect(missing).toBe(BASE_COLUMNS);
    expect(unchanged).toBe(BASE_COLUMNS);
  });
});
