import { prisma } from "@/lib/db/prisma";
import { parseServerEnv } from "@/lib/env/server";

export type ReadinessResult = {
  ready: boolean;
  reason?: "missing_database_url" | "database_timeout" | "database_unreachable";
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("database_timeout"));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function checkDatabaseReadiness(timeoutMs = 2_000): Promise<ReadinessResult> {
  const env = parseServerEnv();

  if (!env.success || !env.data.DATABASE_URL) {
    return { ready: false, reason: "missing_database_url" };
  }

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, timeoutMs);
    return { ready: true };
  } catch (error: unknown) {
    const reason =
      error instanceof Error && error.message === "database_timeout"
        ? "database_timeout"
        : "database_unreachable";

    return { ready: false, reason };
  }
}
