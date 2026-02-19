import { getAuthenticatedAppUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { WorkspaceRole } from "@prisma/client";

export type BoardAccessResult =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "ok"; userId: string; role: WorkspaceRole };

export async function canAccessBoard(
  boardId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
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
      workspace: {
        select: {
          members: {
            where: {
              userId,
            },
            select: {
              role: true,
            },
            take: 1,
          },
        },
      },
    },
  });

  const role = board?.workspace.members[0]?.role;
  return role ?? null;
}

export function canWriteBoard(role: WorkspaceRole): boolean {
  return role !== WorkspaceRole.VIEWER;
}

export async function getBoardAccess(boardId: string): Promise<BoardAccessResult> {
  const sessionUser = await getAuthenticatedAppUser();

  if (!sessionUser) {
    return { status: "unauthenticated" };
  }

  const userId = sessionUser.appUserId;
  const role = await canAccessBoard(boardId, userId);

  if (!role) {
    return { status: "not_found" };
  }

  return { status: "ok", userId, role };
}
