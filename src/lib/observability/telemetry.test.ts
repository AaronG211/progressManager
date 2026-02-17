import { createPosthogClient } from "@/lib/observability/posthog";
import { createSentryClient } from "@/lib/observability/sentry";
import { describe, expect, it, vi } from "vitest";

describe("telemetry scaffolds", () => {
  it("keeps sentry wrapper no-op when dsn missing", () => {
    const client = createSentryClient({ dsn: undefined });

    expect(() => client.track("test_event")).not.toThrow();
    expect(() => client.identify("user-1")).not.toThrow();
    expect(() => client.captureException(new Error("boom"))).not.toThrow();
  });

  it("keeps posthog wrapper no-op when key and host missing", () => {
    const client = createPosthogClient({ apiKey: undefined, host: undefined });

    expect(() => client.track("test_event")).not.toThrow();
    expect(() => client.identify("user-2")).not.toThrow();
    expect(() => client.captureException(new Error("boom"))).not.toThrow();
  });

  it("posts event when posthog config exists", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 200,
      }),
    );

    const client = createPosthogClient({
      apiKey: "phc_demo",
      host: "https://app.posthog.com",
    });

    client.track("button_clicked", {
      distinct_id: "user-3",
    });

    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
