import { LoginForm } from "@/components/auth/login-form";
import { getAuthenticatedAppUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getAuthenticatedAppUser();

  if (user) {
    redirect("/");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-6 px-6 py-10">
      <header className="max-w-xl text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-foreground-subtle)]">Stage 1 Auth</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--color-foreground)]">Sign in to your workspace</h1>
        <p className="mt-2 text-sm text-[var(--color-foreground-muted)]">
          We use Supabase magic-link authentication for Stage 1 MVP.
        </p>
      </header>
      <LoginForm />
    </div>
  );
}
