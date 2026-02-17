import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: optionalString,
  SENTRY_DSN: optionalUrl,
  SENTRY_ENVIRONMENT: z.string().min(1).default("development"),
  APP_VERSION: z.string().min(1).default("0.1.0"),
});

export type AppEnvServer = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  source: Record<string, string | undefined> = process.env,
) {
  return serverEnvSchema.safeParse(source);
}

export function getServerEnv(source: Record<string, string | undefined> = process.env): AppEnvServer {
  const parsed = parseServerEnv(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue: z.ZodIssue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment configuration: ${issues}`);
  }

  return parsed.data;
}
