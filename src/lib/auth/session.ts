import { prisma } from "@/lib/db/prisma";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";

type AuthenticatedAppUser = {
  appUserId: string;
  email: string;
  name: string | null;
  supabaseUserId: string;
};

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

  const user = await prisma.user.upsert({
    where: {
      email: data.user.email,
    },
    update: {
      name: profileName,
      supabaseAuthId: data.user.id,
    },
    create: {
      email: data.user.email,
      name: profileName,
      supabaseAuthId: data.user.id,
    },
  });

  return {
    appUserId: user.id,
    email: user.email,
    name: user.name,
    supabaseUserId: data.user.id,
  };
}
