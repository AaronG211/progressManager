import type { StageOneGroup, StageOneItem } from "@/lib/stage1/types";

export function flattenVisibleRows(groups: StageOneGroup[]): StageOneItem[] {
  const rows: StageOneItem[] = [];

  for (const group of groups) {
    if (group.isCollapsed) {
      continue;
    }

    rows.push(...group.items);
  }

  return rows;
}

export function hasNoSearchResults(groups: StageOneGroup[], search: string): boolean {
  return search.trim().length > 0 && groups.length === 0;
}
