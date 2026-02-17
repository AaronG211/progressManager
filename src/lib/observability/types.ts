export type TelemetryProperties = Record<string, unknown>;

export interface TelemetryClient {
  track: (event: string, properties?: TelemetryProperties) => void;
  identify: (userId: string, traits?: TelemetryProperties) => void;
  captureException: (error: unknown, context?: TelemetryProperties) => void;
}

export function createNoopTelemetryClient(): TelemetryClient {
  return {
    track: () => {},
    identify: () => {},
    captureException: () => {},
  };
}
