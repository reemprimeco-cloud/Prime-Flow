import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { getCurrentMonthStats, listMonthlyStatistics } from "@/lib/actions/reports";
import { ReportsClient } from "@/components/manager/reports-client";

export const metadata: Metadata = {
  title: "Reports — Prime Production Board",
};

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireAdmin();
  const [monthlyStats, currentMonth] = await Promise.all([listMonthlyStatistics(), getCurrentMonthStats()]);

  return <ReportsClient initialStats={monthlyStats} initialCurrentMonth={currentMonth} />;
}
