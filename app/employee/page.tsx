import type { Metadata } from "next";

import { requireEmployee } from "@/lib/auth/guards";
import { getMyJobs } from "@/lib/actions/employee-jobs";
import { EmployeeDashboardClient } from "@/components/employee/employee-dashboard-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Jobs — Prime Production Board",
};

export default async function EmployeeDashboardPage() {
  const session = await requireEmployee();
  const jobs = await getMyJobs();

  return <EmployeeDashboardClient initialJobs={jobs} fullName={session.fullName} />;
}
