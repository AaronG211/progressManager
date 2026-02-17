import { getClientEnv, parseClientEnv } from "@/lib/env/client";
import {
  createNoopTelemetryClient,
  type TelemetryClient,
  type TelemetryProperties,
} from "@/lib/observability/types";

type PosthogOptions = {
  apiKey?: string;
  host?: string;
};

function getDistinctId(properties?: TelemetryProperties): string {
  const value = properties?.distinct_id;

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return "anonymous";
}

function sendPosthogPayload(host: string, payload: Record<string, unknown>): void {
  void fetch(`${host.replace(/\/$/, "")}/capture/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Stage 0 scaffold: fail quietly without breaking user interactions.
  });
}

export function createPosthogClient(options?: PosthogOptions): TelemetryClient {
  const parsedClientEnv = parseClientEnv();

  let apiKey = options?.apiKey;
  let host = options?.host;

  if (!apiKey || !host) {
    try {
      const clientEnv = getClientEnv();
      apiKey = apiKey ?? clientEnv.NEXT_PUBLIC_POSTHOG_KEY;
      host = host ?? clientEnv.NEXT_PUBLIC_POSTHOG_HOST;
    } catch {
      if (parsedClientEnv.success) {
        apiKey = apiKey ?? parsedClientEnv.data.NEXT_PUBLIC_POSTHOG_KEY;
        host = host ?? parsedClientEnv.data.NEXT_PUBLIC_POSTHOG_HOST;
      }
    }
  }

  if (!apiKey || !host) {
    return createNoopTelemetryClient();
  }

  return {
    track: (event: string, properties?: TelemetryProperties) => {
      sendPosthogPayload(host, {
        api_key: apiKey,
        event,
        distinct_id: getDistinctId(properties),
        properties: {
          ...properties,
          $lib: "progress-manager-stage0",
        },
      });
    },
    identify: (userId: string, traits?: TelemetryProperties) => {
      sendPosthogPayload(host, {
        api_key: apiKey,
        event: "$identify",
        distinct_id: userId,
        properties: {
          ...traits,
          distinct_id: userId,
        },
      });
    },
    captureException: (error: unknown, context?: TelemetryProperties) => {
      const normalizedError = error instanceof Error ? error : new Error(String(error));

      sendPosthogPayload(host, {
        api_key: apiKey,
        event: "exception",
        distinct_id: getDistinctId(context),
        properties: {
          ...context,
          message: normalizedError.message,
          stack: normalizedError.stack,
        },
      });
    },
  };
}
