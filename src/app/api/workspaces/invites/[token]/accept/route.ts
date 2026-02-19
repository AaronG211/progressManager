import { getAuthenticatedAppUser } from "@/lib/auth/session";
import { getTelemetryClient } from "@/lib/observability";
import { acceptWorkspaceInvite } from "@/lib/stage2/invites";
import { NextResponse } from "next/server";
import { z } from "zod";

const telemetry = getTelemetryClient();

const tokenSchema = z
  .string()
  .trim()
  .min(20)
  .max(200)
  .regex(/^[a-zA-Z0-9]+$/);

type RouteContext = {
  params: Promise<{ token: string }>;
};

function toLoginRedirect(requestUrl: URL, reason: string) {
  const url = new URL("/login", requestUrl.origin);
  url.searchParams.set("next", "/");
  url.searchParams.set("error", reason);
  return url;
}

function toErrorRedirect(requestUrl: URL, reason: string) {
  const url = new URL("/login", requestUrl.origin);
  url.searchParams.set("next", "/");
  url.searchParams.set("error", reason);
  return url;
}

async function handleAccept(request: Request, token: string) {
  let parsedToken: string;

  try {
    parsedToken = tokenSchema.parse(token);
  } catch {
    return { status: "invalid_token" as const };
  }

  const authUser = await getAuthenticatedAppUser();

  if (!authUser) {
    return { status: "unauthenticated" as const };
  }

  try {
    const result = await acceptWorkspaceInvite(parsedToken, {
      userId: authUser.appUserId,
      email: authUser.email,
    });
    return result;
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/workspaces/invites/[token]/accept",
      stage: "accept_workspace_invite",
    });

    return { status: "error" as const };
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const result = await handleAccept(request, token);

  if (result.status === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (result.status === "accepted") {
    return NextResponse.json({ status: "accepted", workspaceId: result.workspaceId });
  }

  if (result.status === "not_found" || result.status === "invalid_token") {
    return NextResponse.json({ message: "Invite not found" }, { status: 404 });
  }

  if (result.status === "email_mismatch") {
    return NextResponse.json({ message: "Invite email does not match current user" }, { status: 403 });
  }

  if (result.status === "expired") {
    return NextResponse.json({ message: "Invite expired" }, { status: 410 });
  }

  if (result.status === "invalid_status") {
    return NextResponse.json({ message: "Invite is no longer active" }, { status: 409 });
  }

  return NextResponse.json({ message: "Unable to accept invite" }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  const requestUrl = new URL(request.url);
  const { token } = await context.params;
  const result = await handleAccept(request, token);

  if (result.status === "unauthenticated") {
    return NextResponse.redirect(toLoginRedirect(requestUrl, "auth_required"));
  }

  if (result.status === "accepted") {
    return NextResponse.redirect(new URL("/", requestUrl.origin));
  }

  if (result.status === "not_found" || result.status === "invalid_token") {
    return NextResponse.redirect(toErrorRedirect(requestUrl, "invite_not_found"));
  }

  if (result.status === "email_mismatch") {
    return NextResponse.redirect(toErrorRedirect(requestUrl, "invite_email_mismatch"));
  }

  if (result.status === "expired") {
    return NextResponse.redirect(toErrorRedirect(requestUrl, "invite_expired"));
  }

  if (result.status === "invalid_status") {
    return NextResponse.redirect(toErrorRedirect(requestUrl, "invite_inactive"));
  }

  return NextResponse.redirect(toErrorRedirect(requestUrl, "invite_error"));
}
