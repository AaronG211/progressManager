import { ensureStageOneBoard } from "@/lib/stage1/bootstrap";
import { getAuthenticatedAppUser } from "@/lib/auth/session";
import { getTelemetryClient } from "@/lib/observability";
import { createSampledPaginationResponse } from "@/lib/stage3/pagination-sampling";
import { NextResponse } from "next/server";
import { z } from "zod";

const telemetry = getTelemetryClient();

const paginationSchema = z.object({
  itemOffset: z.coerce.number().int().min(0).optional(),
  itemLimit: z.coerce.number().int().min(1).max(1_000).optional(),
});

export async function GET(request: Request) {
  const startedAtMs = Date.now();

  try {
    const authUser = await getAuthenticatedAppUser();

    if (!authUser) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

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

    const { snapshot, pageInfo } = await ensureStageOneBoard(
      authUser.appUserId,
      hasPaginationRequested ? pagination.data : undefined,
    );

    if (hasPaginationRequested) {
      return createSampledPaginationResponse(
        {
          snapshot,
          pageInfo,
        },
        {
          route: "/api/boards/bootstrap",
          startedAtMs,
          telemetry,
          telemetryContext: {
            boardId: snapshot.boardId,
            userId: authUser.appUserId,
          },
        },
      );
    }

    return NextResponse.json(snapshot);
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/bootstrap",
    });

    return NextResponse.json(
      {
        message: "Unable to bootstrap board",
      },
      { status: 500 },
    );
  }
}
