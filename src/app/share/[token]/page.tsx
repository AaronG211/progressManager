import { StageOneBoard } from "@/components/shell/stage-one-board";

export const dynamic = "force-dynamic";

type SharedBoardPageProps = {
  params: Promise<{ token: string }>;
};

export default async function SharedBoardPage({ params }: SharedBoardPageProps) {
  const { token } = await params;

  return (
    <StageOneBoard
      userLabel="Shared viewer"
      bootstrapPath={`/api/boards/share/${token}`}
      readOnly
      hideSignOut
    />
  );
}
