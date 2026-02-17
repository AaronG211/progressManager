import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";

type AuthenticatedAppUser = {
  appUserId: string;
  email: string;
  name: string | null;
  supabaseUserId: string;
};

const telemetry = getTelemetryClient();

function getSupabaseDisplayName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const value = (metadata as Record<string, unknown>).full_name;

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  const fallback = (metadata as Record<string, unknown>).name;

  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback;
  }

  return null;
}

export async function getAuthenticatedAppUser(): Promise<AuthenticatedAppUser | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || !data.user.email) {
    return null;
  }

  const profileName = getSupabaseDisplayName(data.user.user_metadata);
  let user:
    | {
        id: string;
        email: string;
        name: string | null;
      }
    | null = null;

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { supabaseAuthId: data.user.id },
          { email: data.user.email },
        ],
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      user = await prisma.user.update({
        where: {
          id: existingUser.id,
        },
        data: {
          email: data.user.email,
          name: profileName,
          supabaseAuthId: data.user.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: data.user.email,
          name: profileName,
          supabaseAuthId: data.user.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });
    }
  } catch (error: unknown) {
    telemetry.captureException(error, {
      module: "auth/session",
      stage: "sync_app_user",
      email: data.user.email,
      supabaseUserId: data.user.id,
    });
    return null;
  }

  if (!user) {
    return null;
  }

  return {
    appUserId: user.id,
    email: user.email,
    name: user.name,
    supabaseUserId: data.user.id,
  };
}
