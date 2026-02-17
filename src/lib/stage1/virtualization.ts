export type VirtualWindowInput = {
  totalCount: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan: number;
};

export type VirtualWindow = {
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getVirtualWindow({
  totalCount,
  scrollTop,
  viewportHeight,
  rowHeight,
  overscan,
}: VirtualWindowInput): VirtualWindow {
  if (totalCount <= 0) {
    return {
      startIndex: 0,
      endIndex: -1,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    };
  }

  const safeRowHeight = Math.max(1, rowHeight);
  const safeOverscan = Math.max(0, overscan);
  const safeViewportHeight = Math.max(safeRowHeight, viewportHeight);

  const rawStartIndex = Math.floor(scrollTop / safeRowHeight) - safeOverscan;
  const rawEndIndex = Math.ceil((scrollTop + safeViewportHeight) / safeRowHeight) + safeOverscan - 1;
  const maxIndex = totalCount - 1;
  const startIndex = clamp(rawStartIndex, 0, maxIndex);
  const endIndex = clamp(rawEndIndex, startIndex, maxIndex);
  const topSpacerHeight = startIndex * safeRowHeight;
  const bottomSpacerHeight = Math.max(0, (totalCount - endIndex - 1) * safeRowHeight);

  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
  };
}
