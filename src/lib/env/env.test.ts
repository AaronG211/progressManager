import { parseClientEnv } from "@/lib/env/client";
import { parseServerEnv } from "@/lib/env/server";
import { describe, expect, it } from "vitest";

describe("env parsing", () => {
  it("parses valid server env values", () => {
    const parsed = parseServerEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://demo:demo@localhost:5432/progress",
      APP_VERSION: "1.2.3",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    expect(parsed.data.NODE_ENV).toBe("production");
    expect(parsed.data.DATABASE_URL).toContain("postgresql://");
    expect(parsed.data.APP_VERSION).toBe("1.2.3");
  });

  it("rejects invalid client url", () => {
    const parsed = parseClientEnv({
      NEXT_PUBLIC_APP_URL: "not-a-url",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts empty optional observability settings", () => {
    const parsed = parseServerEnv({
      NODE_ENV: "development",
      DATABASE_URL: "",
      SENTRY_DSN: "",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    expect(parsed.data.DATABASE_URL).toBeUndefined();
    expect(parsed.data.SENTRY_DSN).toBeUndefined();
  });
});
