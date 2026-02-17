import { parseServerEnv } from "@/lib/env/server";
import {
  createNoopTelemetryClient,
  type TelemetryClient,
  type TelemetryProperties,
} from "@/lib/observability/types";

type SentryOptions = {
  dsn?: string;
  environment?: string;
};

function logSentryPayload(kind: string, payload: TelemetryProperties): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  // Stage 0 scaffold: make payload visible without adding SDK lock-in.
  console.info(`[sentry:${kind}]`, payload);
}

export function createSentryClient(options?: SentryOptions): TelemetryClient {
  const parsedServerEnv = parseServerEnv();
  const dsn = options?.dsn ?? (parsedServerEnv.success ? parsedServerEnv.data.SENTRY_DSN : undefined);
  const environment =
    options?.environment ??
    (parsedServerEnv.success ? parsedServerEnv.data.SENTRY_ENVIRONMENT : "development");

  if (!dsn) {
    return createNoopTelemetryClient();
  }

  return {
    track: (event: string, properties?: TelemetryProperties) => {
      logSentryPayload("track", {
        dsn,
        environment,
        event,
        properties,
      });
    },
    identify: (userId: string, traits?: TelemetryProperties) => {
      logSentryPayload("identify", {
        dsn,
        environment,
        userId,
        traits,
      });
    },
    captureException: (error: unknown, context?: TelemetryProperties) => {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      logSentryPayload("exception", {
        dsn,
        environment,
        message: normalizedError.message,
        stack: normalizedError.stack,
        context,
      });
    },
  };
}
