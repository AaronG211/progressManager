import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { canWriteBoard, getBoardAccess } from "@/lib/stage1/route-utils";
import { writeWorkspaceAuditLog } from "@/lib/stage2/audit";
import type { BoardShareSettingsSummary } from "@/lib/stage2/types";
import { canManageWorkspace } from "@/lib/stage2/workspace-access";

const telemetry = getTelemetryClient();

const updateBoardShareSchema = z
  .object({
    isPrivate: z.boolean().optional(),
    shareLinkEnabled: z.boolean().optional(),
  })
  .refine((value) => value.isPrivate !== undefined || value.shareLinkEnabled !== undefined, {
    message: "Nothing to update",
  });

type RouteContext = {
  params: Promise<{ boardId: string }>;
};

function createBoardShareToken(): string {
  return randomBytes(24).toString("base64url");
}

function buildShareUrl(origin: string, token: string | null, isPrivate: boolean): string | null {
  if (!token || isPrivate) {
    return null;
  }

  return `${origin}/share/${token}`;
}

function toSummary(
  origin: string,
  input: {
    role: BoardShareSettingsSummary["role"];
    canWrite: boolean;
    canManage: boolean;
    isPrivate: boolean;
    shareToken: string | null;
  },
): BoardShareSettingsSummary {
  return {
    role: input.role,
    canWrite: input.canWrite,
    canManage: input.canManage,
    isPrivate: input.isPrivate,
    shareUrl: buildShareUrl(origin, input.shareToken, input.isPrivate),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { boardId } = await context.params;
  const access = await getBoardAccess(boardId);

  if (access.status === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (access.status === "not_found") {
    return NextResponse.json({ message: "Board not found" }, { status: 404 });
  }

  try {
    const board = await prisma.board.findUnique({
      where: {
        id: boardId,
      },
      select: {
        isPrivate: true,
        shareToken: true,
      },
    });

    if (!board) {
      return NextResponse.json({ message: "Board not found" }, { status: 404 });
    }

    const requestUrl = new URL(request.url);

    return NextResponse.json(
      toSummary(requestUrl.origin, {
        role: access.role,
        canWrite: canWriteBoard(access.role),
        canManage: canManageWorkspace(access.role),
        isPrivate: board.isPrivate,
        shareToken: board.shareToken,
      }),
    );
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/[boardId]/share",
      boardId,
      userId: access.userId,
      method: "GET",
    });

    return NextResponse.json({ message: "Unable to load board sharing settings" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { boardId } = await context.params;
  const access = await getBoardAccess(boardId);

  if (access.status === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (access.status === "not_found") {
    return NextResponse.json({ message: "Board not found" }, { status: 404 });
  }

  if (!canManageWorkspace(access.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let payload: z.infer<typeof updateBoardShareSchema>;

  try {
    payload = updateBoardShareSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  try {
    const board = await prisma.board.findUnique({
      where: {
        id: boardId,
      },
      select: {
        id: true,
        workspaceId: true,
        isPrivate: true,
        shareToken: true,
      },
    });

    if (!board) {
      return NextResponse.json({ message: "Board not found" }, { status: 404 });
    }

    const nextIsPrivate = payload.isPrivate ?? board.isPrivate;

    if (payload.shareLinkEnabled === true && nextIsPrivate) {
      return NextResponse.json(
        { message: "Private boards cannot have share links" },
        { status: 400 },
      );
    }

    let nextShareToken = board.shareToken;

    if (nextIsPrivate || payload.shareLinkEnabled === false) {
      nextShareToken = null;
    }

    if (!nextIsPrivate && payload.shareLinkEnabled === true && !nextShareToken) {
      nextShareToken = createBoardShareToken();
    }

    const updatedBoard = await prisma.board.update({
      where: {
        id: board.id,
      },
      data: {
        isPrivate: nextIsPrivate,
        shareToken: nextShareToken,
      },
      select: {
        isPrivate: true,
        shareToken: true,
      },
    });

    await writeWorkspaceAuditLog({
      workspaceId: board.workspaceId,
      actorUserId: access.userId,
      action: "board_share_settings_updated",
      entityType: "Board",
      entityId: board.id,
      details: {
        previousIsPrivate: board.isPrivate,
        nextIsPrivate: updatedBoard.isPrivate,
        hadShareLink: board.shareToken !== null,
        hasShareLink: updatedBoard.shareToken !== null,
      },
    });

    telemetry.track("stage2_board_share_settings_updated", {
      boardId,
      userId: access.userId,
      isPrivate: updatedBoard.isPrivate,
      hasShareLink: updatedBoard.shareToken !== null,
    });

    const requestUrl = new URL(request.url);

    return NextResponse.json(
      toSummary(requestUrl.origin, {
        role: access.role,
        canWrite: canWriteBoard(access.role),
        canManage: canManageWorkspace(access.role),
        isPrivate: updatedBoard.isPrivate,
        shareToken: updatedBoard.shareToken,
      }),
    );
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/[boardId]/share",
      boardId,
      userId: access.userId,
      method: "PATCH",
    });

    return NextResponse.json({ message: "Unable to update board sharing settings" }, { status: 500 });
  }
}
