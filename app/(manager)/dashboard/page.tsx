import type { Metadata } from "next";
import { Suspense } from "react";

import { requireAdmin } from "@/lib/auth/guards";
import { getDashboardBoard, getDashboardStats, getOrders } from "@/lib/actions/orders";
import { listEmployees } from "@/lib/actions/employees";
import { DashboardClient } from "@/components/manager/dashboard-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard — Prime Production Board",
};

function getGreeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await requireAdmin();
  const now = new Date();

  // The board is the default view and the only one most visits ever see.
  // Fetch just what the requested view renders: the paged list query (and
  // its enrichment round trips) only runs for ?view=list|card, and the
  // board only for the board. The other one loads client-side on toggle.
  const { view } = await searchParams;
  const isBoardView = view !== "list" && view !== "card";

  const [stats, ordersResult, board, employees] = await Promise.all([
    getDashboardStats(),
    isBoardView ? Promise.resolve(null) : getOrders(),
    isBoardView ? getDashboardBoard() : Promise.resolve(null),
    listEmployees(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {getGreeting(now.getHours())}, {session.fullName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          {now.toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <Suspense fallback={null}>
        <DashboardClient
          initialStats={stats}
          initialOrdersResult={ordersResult}
          initialBoard={board}
          employees={employees}
        />
      </Suspense>
    </div>
  );
}
