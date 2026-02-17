import { prisma } from "@/lib/db/prisma";
import {
  serializeBoardSnapshot,
  stageOneBoardInclude,
  type StageOneBoardRecord,
} from "@/lib/stage1/serializers";

export async function getBoardRecord(boardId: string): Promise<StageOneBoardRecord | null> {
  return prisma.board.findUnique({
    where: {
      id: boardId,
    },
    include: stageOneBoardInclude,
  });
}

export async function getBoardSnapshot(boardId: string) {
  const board = await getBoardRecord(boardId);

  if (!board) {
    return null;
  }

  return serializeBoardSnapshot(board);
}
