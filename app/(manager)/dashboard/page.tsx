import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = {
  title: "Dashboard — Prime Production Board",
};

function getGreeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const session = await requireAdmin();
  const now = new Date();

  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold tracking-tight">
        {getGreeting(now.getHours())}, {session.fullName.split(" ")[0]}
      </h1>
      <p className="text-sm text-muted-foreground">
        {now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      </p>
    </div>
  );
}
