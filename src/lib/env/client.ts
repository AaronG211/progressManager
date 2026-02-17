import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_POSTHOG_KEY: optionalString,
  NEXT_PUBLIC_POSTHOG_HOST: optionalUrl,
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
});

export type AppEnvClient = z.infer<typeof clientEnvSchema>;

export function parseClientEnv(
  source: Record<string, string | undefined> = process.env,
) {
  return clientEnvSchema.safeParse(source);
}

export function getClientEnv(source: Record<string, string | undefined> = process.env): AppEnvClient {
  const parsed = parseClientEnv(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue: z.ZodIssue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid client environment configuration: ${issues}`);
  }

  return parsed.data;
}
