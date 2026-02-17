export type GridArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export type GridPosition = {
  row: number;
  col: number;
};

export function isGridArrowKey(key: string): key is GridArrowKey {
  return key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
}

export function getNextGridPosition(
  current: GridPosition,
  key: GridArrowKey,
  rowCount: number,
  columnCount: number,
): GridPosition | null {
  if (rowCount <= 0 || columnCount <= 0) {
    return null;
  }

  const lastRow = rowCount - 1;
  const lastCol = columnCount - 1;
  let nextRow = current.row;
  let nextCol = current.col;

  if (key === "ArrowUp") {
    nextRow = Math.max(0, current.row - 1);
  }

  if (key === "ArrowDown") {
    nextRow = Math.min(lastRow, current.row + 1);
  }

  if (key === "ArrowLeft") {
    nextCol = Math.max(0, current.col - 1);
  }

  if (key === "ArrowRight") {
    nextCol = Math.min(lastCol, current.col + 1);
  }

  if (nextRow === current.row && nextCol === current.col) {
    return null;
  }

  return {
    row: nextRow,
    col: nextCol,
  };
}
