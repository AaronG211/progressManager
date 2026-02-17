import type { StageOneBoardSnapshot, StageOneGroup, StageOneStatusOption } from "@/lib/stage1/types";

export function getStatusOptions(rawOptions: StageOneStatusOption[] | undefined): StageOneStatusOption[] {
  if (!rawOptions || rawOptions.length === 0) {
    return [
      { label: "Not Started", color: "slate" },
      { label: "Working", color: "amber" },
      { label: "Blocked", color: "rose" },
      { label: "Done", color: "emerald" },
    ];
  }

  return rawOptions;
}

export function filterGroupsByItemName(
  groups: StageOneGroup[],
  query: string,
): StageOneGroup[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return groups;
  }

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.name.toLowerCase().includes(normalized)),
    }))
    .filter((group) => group.items.length > 0);
}

export function filterBoardSnapshotByItemName(
  board: StageOneBoardSnapshot,
  query: string,
): StageOneBoardSnapshot {
  return {
    ...board,
    groups: filterGroupsByItemName(board.groups, query),
  };
}
