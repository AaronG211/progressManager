import { StageOneBoard } from "@/components/shell/stage-one-board";
import { getAuthenticatedAppUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getAuthenticatedAppUser();

  if (!user) {
    redirect("/login");
  }

  return <StageOneBoard userLabel={user.name || user.email} />;
}
