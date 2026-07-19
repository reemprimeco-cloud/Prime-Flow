import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { listEmployees } from "@/lib/actions/employees";
import { CompletedOrdersPanel } from "@/components/manager/completed-orders-panel";

export const metadata: Metadata = {
  title: "Completed Orders — Prime Production Board",
};

export const dynamic = "force-dynamic";

export default async function CompletedOrdersPage() {
  await requireAdmin();
  const employees = await listEmployees();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Completed Orders</h1>
        <p className="text-sm text-muted-foreground">
          Collected, delivered, and completed orders — off the live board, not yet archived.
        </p>
      </div>
      <CompletedOrdersPanel employees={employees} />
    </div>
  );
}
