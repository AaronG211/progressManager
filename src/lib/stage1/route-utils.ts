import { getAuthenticatedAppUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export type BoardAccessResult =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "ok"; userId: string };

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

export async function getBoardAccess(boardId: string): Promise<BoardAccessResult> {
  const sessionUser = await getAuthenticatedAppUser();

  if (!sessionUser) {
    return { status: "unauthenticated" };
  }

  const userId = sessionUser.appUserId;
  const hasAccess = await canAccessBoard(boardId, userId);

  if (!hasAccess) {
    return { status: "not_found" };
  }

  return { status: "ok", userId };
}
