import { getOrCreateSessionUser } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";

export async function getSessionUserId(): Promise<string> {
  const user = await getOrCreateSessionUser();
  return user.id;
}

export async function canAccessBoard(boardId: string, userId: string): Promise<boolean> {
  const board = await prisma.board.findFirst({
    where: {
      id: boardId,
      workspace: {
        members: {
          some: {
            userId,
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(board);
}

export async function assertBoardAccess(boardId: string): Promise<string | null> {
  const userId = await getSessionUserId();
  const hasAccess = await canAccessBoard(boardId, userId);

  if (!hasAccess) {
    return null;
  }

  return userId;
}
