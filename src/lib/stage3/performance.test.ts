import { applyBoardViewConfig, paginateBoardItems } from "@/lib/stage3/view-framework";
import type { StageOneBoardSnapshot, StageOneCellValue, StageOneItem } from "@/lib/stage1/types";
import { describe, expect, it } from "vitest";

const FIXTURE_ITEM_COUNT = 10_000;
const FIXTURE_GROUP_COUNT = 20;
const BENCH_ROUNDS = 5;
const runBenchSuite = process.env.STAGE3_BENCH === "1";
const benchDescribe = runBenchSuite ? describe : describe.skip;

type BenchResult<T> = {
  last: T;
  averageMs: number;
  minMs: number;
  maxMs: number;
};

function makeCellValue(overrides: Partial<StageOneCellValue>): StageOneCellValue {
  return {
    id: "value_base",
    itemId: "item_base",
    columnId: "col_base",
    textValue: null,
    statusValue: null,
    personId: null,
    dateValue: null,
    numberValue: null,
    tagsValue: null,
    checkboxValue: null,
    urlValue: null,
    ...overrides,
  };
}

function buildItem(globalIndex: number, groupId: string): StageOneItem {
  const itemId = `item_${globalIndex}`;
  const statusValue = globalIndex % 4 === 0 ? "Working" : globalIndex % 3 === 0 ? "Blocked" : "Not Started";
  const personId = `user_${globalIndex % 30}`;
  const dateValue = new Date(Date.UTC(2026, 0, (globalIndex % 28) + 1)).toISOString();
  const numberValue = globalIndex % 100;
  const tagsValue = globalIndex % 2 === 0 ? ["urgent", "alpha"] : ["beta"];
  const checkboxValue = globalIndex % 2 === 0;
  const urlValue = `https://example.com/items/${itemId}`;

  return {
    id: itemId,
    groupId,
    name: `Item ${globalIndex}`,
    position: globalIndex,
    lastEditedById: personId,
    values: [
      makeCellValue({
        id: `v_status_${globalIndex}`,
        itemId,
        columnId: "col_status",
        statusValue,
      }),
      makeCellValue({
        id: `v_person_${globalIndex}`,
        itemId,
        columnId: "col_person",
        personId,
      }),
      makeCellValue({
        id: `v_date_${globalIndex}`,
        itemId,
        columnId: "col_date",
        dateValue,
      }),
      makeCellValue({
        id: `v_number_${globalIndex}`,
        itemId,
        columnId: "col_number",
        numberValue,
      }),
      makeCellValue({
        id: `v_tags_${globalIndex}`,
        itemId,
        columnId: "col_tags",
        tagsValue,
      }),
      makeCellValue({
        id: `v_checkbox_${globalIndex}`,
        itemId,
        columnId: "col_checkbox",
        checkboxValue,
      }),
      makeCellValue({
        id: `v_url_${globalIndex}`,
        itemId,
        columnId: "col_url",
        urlValue,
      }),
    ],
  };
}

function buildLargeBoardFixture(
  itemCount = FIXTURE_ITEM_COUNT,
  groupCount = FIXTURE_GROUP_COUNT,
): StageOneBoardSnapshot {
  const groups = Array.from({ length: groupCount }, (_, groupIndex) => {
    const groupId = `group_${groupIndex}`;
    const items: StageOneItem[] = [];

    for (let itemIndex = groupIndex; itemIndex < itemCount; itemIndex += groupCount) {
      items.push(buildItem(itemIndex, groupId));
    }

    return {
      id: groupId,
      name: `Group ${groupIndex + 1}`,
      position: groupIndex,
      isCollapsed: false,
      items: items.sort((a, b) => a.position - b.position),
    };
  });

  return {
    workspaceId: "workspace_bench",
    boardId: "board_bench",
    boardName: "Stage 3 Bench Board",
    views: [],
    columns: [
      { id: "col_text", name: "Notes", type: "TEXT", position: 0, settings: null },
      {
        id: "col_status",
        name: "Status",
        type: "STATUS",
        position: 1,
        settings: {
          options: [
            { label: "Not Started", color: "slate" },
            { label: "Working", color: "amber" },
            { label: "Blocked", color: "rose" },
          ],
        },
      },
      { id: "col_person", name: "Owner", type: "PERSON", position: 2, settings: null },
      { id: "col_date", name: "Due", type: "DATE", position: 3, settings: null },
      { id: "col_number", name: "Estimate", type: "NUMBER", position: 4, settings: null },
      { id: "col_tags", name: "Tags", type: "TAGS", position: 5, settings: null },
      { id: "col_checkbox", name: "Done", type: "CHECKBOX", position: 6, settings: null },
      { id: "col_url", name: "URL", type: "URL", position: 7, settings: null },
    ],
    groups,
    members: [],
  };
}

function runBench<T>(rounds: number, fn: () => T): BenchResult<T> {
  const times: number[] = [];
  let last!: T;

  for (let index = 0; index < rounds; index += 1) {
    const start = performance.now();
    last = fn();
    times.push(performance.now() - start);
  }

  const total = times.reduce((sum, value) => sum + value, 0);

  return {
    last,
    averageMs: total / times.length,
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
  };
}

function formatBench(result: BenchResult<unknown>): string {
  return `avg=${result.averageMs.toFixed(2)}ms min=${result.minMs.toFixed(2)}ms max=${result.maxMs.toFixed(2)}ms`;
}

benchDescribe("Stage 3 performance baseline (manual bench)", () => {
  it("measures pagination and filtering on a 10k-item fixture", () => {
    const board = buildLargeBoardFixture();

    const firstPageBench = runBench(BENCH_ROUNDS, () =>
      paginateBoardItems(board, { itemOffset: 0, itemLimit: 300 }),
    );
    const deepPageBench = runBench(BENCH_ROUNDS, () =>
      paginateBoardItems(board, { itemOffset: 7_500, itemLimit: 300 }),
    );
    const filteredBench = runBench(BENCH_ROUNDS, () =>
      applyBoardViewConfig(board, {
        statusValue: "Working",
        numberMin: 20,
        numberMax: 90,
        tagValue: "urgent",
        checkboxValue: true,
        urlQuery: "/items/",
        sortBy: "number_desc",
      }),
    );

    console.info(`[stage3-bench] paginate-first-page: ${formatBench(firstPageBench)}`);
    console.info(`[stage3-bench] paginate-deep-page: ${formatBench(deepPageBench)}`);
    console.info(`[stage3-bench] apply-view-filters: ${formatBench(filteredBench)}`);

    expect(firstPageBench.last.pageInfo.returnedItems).toBe(300);
    expect(deepPageBench.last.pageInfo.itemOffset).toBe(7_500);
    expect(filteredBench.last.groups.length).toBeGreaterThan(0);
  });
});

