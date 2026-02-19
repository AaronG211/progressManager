import type { TelemetryClient, TelemetryProperties } from "@/lib/observability";
import type { StageBoardPageInfo } from "@/lib/stage3/view-framework";
import { NextResponse } from "next/server";

type StageBoardPaginationEnvelope<TSnapshot> = {
  snapshot: TSnapshot;
  pageInfo: StageBoardPageInfo | null;
};

type PaginationSamplingContext = {
  route: string;
  startedAtMs: number;
  telemetry: TelemetryClient;
  telemetryContext?: TelemetryProperties;
  eventName?: string;
};

function getPayloadBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}

export function createSampledPaginationResponse<TSnapshot>(
  payload: StageBoardPaginationEnvelope<TSnapshot>,
  context: PaginationSamplingContext,
) {
  const response = NextResponse.json(payload);
  const { pageInfo } = payload;

  if (!pageInfo) {
    return response;
  }

  const durationMs = Math.max(0, Date.now() - context.startedAtMs);
  const payloadBytes = getPayloadBytes(payload);

  response.headers.set("x-stage3-page-offset", String(pageInfo.itemOffset));
  response.headers.set("x-stage3-page-limit", String(pageInfo.itemLimit));
  response.headers.set("x-stage3-page-returned", String(pageInfo.returnedItems));
  response.headers.set("x-stage3-page-total", String(pageInfo.totalItems));
  response.headers.set("x-stage3-page-has-more", String(pageInfo.hasMore));
  response.headers.set("x-stage3-payload-bytes", String(payloadBytes));
  response.headers.set("x-stage3-duration-ms", String(durationMs));
  response.headers.set("server-timing", `stage3-pagination;dur=${durationMs}`);

  context.telemetry.track(context.eventName ?? "stage3_pagination_served", {
    route: context.route,
    itemOffset: pageInfo.itemOffset,
    itemLimit: pageInfo.itemLimit,
    returnedItems: pageInfo.returnedItems,
    totalItems: pageInfo.totalItems,
    hasMore: pageInfo.hasMore,
    payloadBytes,
    durationMs,
    ...context.telemetryContext,
  });

  return response;
}
