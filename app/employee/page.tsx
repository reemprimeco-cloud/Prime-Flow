import type { Metadata } from "next";

import { requireEmployee } from "@/lib/auth/guards";

export const metadata: Metadata = {
  title: "My Jobs — Prime Production Board",
};

export default async function EmployeeDashboardPage() {
  const session = await requireEmployee();

  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold tracking-tight">Welcome, {session.fullName.split(" ")[0]}</h1>
      <p className="text-sm text-muted-foreground">Your assigned jobs will appear here.</p>
    </div>
  );
}
