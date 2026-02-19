import { prisma } from "@/lib/db/prisma";
import {
  serializeBoardSnapshot,
  stageOneBoardInclude,
  type StageOneBoardRecord,
} from "@/lib/stage1/serializers";
import type { StageOneBoardSnapshot } from "@/lib/stage1/types";
import {
  paginateBoardItems,
  type StageBoardPageInfo,
} from "@/lib/stage3/view-framework";

const DEFAULT_ITEM_LIMIT = 300;

export type BoardSnapshotPaginationOptions = {
  itemOffset?: number;
  itemLimit?: number;
};

export type BoardSnapshotWithPageInfo = {
  snapshot: StageOneBoardSnapshot;
  pageInfo: StageBoardPageInfo | null;
};

export async function getBoardRecord(boardId: string): Promise<StageOneBoardRecord | null> {
  return prisma.board.findUnique({
    where: {
      id: boardId,
    },
    include: stageOneBoardInclude,
  });
}

export async function getBoardSnapshotWithPageInfo(
  boardId: string,
  options?: BoardSnapshotPaginationOptions,
): Promise<BoardSnapshotWithPageInfo | null> {
  const board = await getBoardRecord(boardId);

  if (!board) {
    return null;
  }

  const snapshot = serializeBoardSnapshot(board);
  const hasPaginationRequested = options?.itemOffset !== undefined || options?.itemLimit !== undefined;

  if (!hasPaginationRequested) {
    return {
      snapshot,
      pageInfo: null,
    };
  }

  const { snapshot: pagedSnapshot, pageInfo } = paginateBoardItems(snapshot, {
    itemOffset: options?.itemOffset ?? 0,
    itemLimit: options?.itemLimit ?? DEFAULT_ITEM_LIMIT,
  });

  return {
    snapshot: pagedSnapshot,
    pageInfo,
  };
}

export async function getBoardSnapshot(
  boardId: string,
  options?: BoardSnapshotPaginationOptions,
) {
  const result = await getBoardSnapshotWithPageInfo(boardId, options);
  return result?.snapshot ?? null;
}
