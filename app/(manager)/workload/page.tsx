import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { listEmployeeWorkload } from "@/lib/actions/workload";
import { WorkloadClient } from "@/components/manager/workload-client";

export const metadata: Metadata = {
  title: "Employee Workload — Prime Production Board",
};

export const dynamic = "force-dynamic";

export default async function WorkloadPage() {
  await requireAdmin();
  const workload = await listEmployeeWorkload();

  return <WorkloadClient initialWorkload={workload} />;
}
