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
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">Hi, {fullName.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">
            {now
              ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
              : " "}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh jobs"
          className="shrink-0"
        >
          <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <StatBlock label="Assigned" value={assignedCount} />
        <StatBlock label="Done Today" value={completedToday} />
        <div className="rounded-xl bg-muted/40 px-3 py-2.5 text-center">
          <div className="font-mono text-lg font-extrabold tabular-nums leading-none sm:text-xl">
            {now ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "--:--"}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">Time</div>
        </div>
      </div>
    </Card>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2.5 text-center">
      <div className="text-lg font-extrabold tabular-nums leading-none sm:text-xl">{value}</div>
      <div className="mt-1 truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
