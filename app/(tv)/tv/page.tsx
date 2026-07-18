import { getTvBoard } from "@/lib/actions/tv";
import { TvDashboardClient } from "@/components/tv/tv-dashboard-client";

export const dynamic = "force-dynamic";

export default async function TvPage() {
  const board = await getTvBoard();
  return <TvDashboardClient initialBoard={board} />;
}
