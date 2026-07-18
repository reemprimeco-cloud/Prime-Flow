"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface EmployeeTopBarProps {
  fullName: string;
  assignedCount: number;
  completedToday: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function EmployeeTopBar({
  fullName,
  assignedCount,
  completedToday,
  onRefresh,
  isRefreshing,
}: EmployeeTopBarProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="flex flex-wrap items-center justify-between gap-5 p-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hi, {fullName.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          {now
            ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
            : " "}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <StatBlock label="Assigned Jobs" value={assignedCount} />
        <StatBlock label="Completed Today" value={completedToday} />
        <div className="text-right">
          <div className="font-mono text-2xl font-extrabold tabular-nums leading-none">
            {now ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">Current Time</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh jobs"
          className="size-12"
        >
          <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
        </Button>
      </div>
    </Card>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right">
      <div className="text-2xl font-extrabold tabular-nums leading-none">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
