import type { StageOneColumn } from "@/lib/stage1/types";

export function reorderColumnsById(
  columns: StageOneColumn[],
  movingColumnId: string,
  targetColumnId: string,
): StageOneColumn[] {
  const sourceIndex = columns.findIndex((column) => column.id === movingColumnId);
  const targetIndex = columns.findIndex((column) => column.id === targetColumnId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return columns;
  }

  const movingColumn = columns[sourceIndex];
  const nextColumns = columns.filter((column) => column.id !== movingColumnId);
  const insertIndex = nextColumns.findIndex((column) => column.id === targetColumnId);

  if (insertIndex === -1) {
    return columns;
  }

  nextColumns.splice(insertIndex, 0, movingColumn);

  return nextColumns.map((column, position) => ({
    ...column,
    position,
  }));
}
