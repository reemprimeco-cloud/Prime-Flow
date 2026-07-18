import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { getOperationsKpis } from "@/lib/actions/operations";
import { listRecentActivity } from "@/lib/actions/activity";
import { OperationsClient } from "@/components/manager/operations-client";

export const metadata: Metadata = {
  title: "Operations — Prime Production Board",
};

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  await requireAdmin();
  const [kpis, activity] = await Promise.all([getOperationsKpis(), listRecentActivity()]);

  return <OperationsClient initialKpis={kpis} initialActivity={activity} />;
}
