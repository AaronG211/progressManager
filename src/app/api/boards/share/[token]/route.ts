import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { getBoardSnapshotWithPageInfo } from "@/lib/stage1/board-query";
import { createSampledPaginationResponse } from "@/lib/stage3/pagination-sampling";
import { z } from "zod";

const telemetry = getTelemetryClient();

type RouteContext = {
  params: Promise<{ token: string }>;
};

const paginationSchema = z.object({
  itemOffset: z.coerce.number().int().min(0).optional(),
  itemLimit: z.coerce.number().int().min(1).max(1_000).optional(),
});

export async function GET(request: Request, context: RouteContext) {
  const startedAtMs = Date.now();
  const { token } = await context.params;
  const url = new URL(request.url);
  const hasPaginationRequested =
    url.searchParams.has("itemOffset") || url.searchParams.has("itemLimit");
  const pagination = paginationSchema.safeParse({
    itemOffset: url.searchParams.get("itemOffset") ?? undefined,
    itemLimit: url.searchParams.get("itemLimit") ?? undefined,
  });

  if (!pagination.success) {
    return NextResponse.json({ message: "Invalid pagination query" }, { status: 400 });
  }

  try {
    const board = await prisma.board.findFirst({
      where: {
        shareToken: token,
        isPrivate: false,
      },
      select: {
        id: true,
      },
    });

    if (!board) {
      return NextResponse.json({ message: "Share link not found" }, { status: 404 });
    }

    const boardSnapshot = await getBoardSnapshotWithPageInfo(
      board.id,
      hasPaginationRequested ? pagination.data : undefined,
    );

    if (!boardSnapshot) {
      return NextResponse.json({ message: "Board not found" }, { status: 404 });
    }

    if (hasPaginationRequested) {
      return createSampledPaginationResponse(
        {
          snapshot: boardSnapshot.snapshot,
          pageInfo: boardSnapshot.pageInfo,
        },
        {
          route: "/api/boards/share/[token]",
          startedAtMs,
          telemetry,
          telemetryContext: {
            boardId: boardSnapshot.snapshot.boardId,
          },
        },
      );
    }

    return NextResponse.json(boardSnapshot.snapshot);
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/share/[token]",
      token,
    });

    return NextResponse.json({ message: "Unable to load shared board" }, { status: 500 });
  }
}
