import { createPosthogClient } from "@/lib/observability/posthog";
import { createSentryClient } from "@/lib/observability/sentry";
import type { TelemetryClient, TelemetryProperties } from "@/lib/observability/types";

const clients: TelemetryClient[] = [createSentryClient(), createPosthogClient()];

const telemetryClient: TelemetryClient = {
  track: (event: string, properties?: TelemetryProperties) => {
    for (const client of clients) {
      client.track(event, properties);
    }
  },
  identify: (userId: string, traits?: TelemetryProperties) => {
    for (const client of clients) {
      client.identify(userId, traits);
    }
  },
  captureException: (error: unknown, context?: TelemetryProperties) => {
    for (const client of clients) {
      client.captureException(error, context);
    }
  },
};

export function getTelemetryClient(): TelemetryClient {
  return telemetryClient;
}

export type { TelemetryClient, TelemetryProperties };
