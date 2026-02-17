import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { getTelemetryClient } from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";

const telemetry = getTelemetryClient();

function getSafeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeRedirectPath(requestUrl.searchParams.get("next"));
  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set("next", next);

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();

      if (supabase) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          telemetry.captureException(error, {
            route: "/auth/callback",
            stage: "exchange_code_for_session",
            next,
          });
          loginUrl.searchParams.set("error", "auth_callback_failed");
          return NextResponse.redirect(loginUrl);
        }
      }
    } catch (error: unknown) {
      telemetry.captureException(error, {
        route: "/auth/callback",
        stage: "exchange_code_for_session",
        next,
      });
      loginUrl.searchParams.set("error", "auth_callback_failed");
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
