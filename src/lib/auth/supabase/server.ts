import { parseServerEnv } from "@/lib/env/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const env = parseServerEnv();

  if (!env.success) {
    return null;
  }

  const url = env.data.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Cookie mutations can throw during Server Component render.
          // In that case, auth still works via middleware/route callbacks.
        }
      },
    },
  });
}
