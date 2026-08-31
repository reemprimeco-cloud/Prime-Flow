"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardList, Users } from "lucide-react";

interface TvStatsBarProps {
  activeOrders: number;
  delayedOrders: number;
  employeesWorking: number;
}

export function TvStatsBar({ activeOrders, delayedOrders, employeesWorking }: TvStatsBarProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-3 border-b-2 border-border bg-card px-6 py-3.5">
      <div>
        <div className="font-mono text-4xl font-extrabold tabular-nums leading-none">
          {now ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "--:--"}
        </div>
        <div className="mt-1 text-base font-semibold text-muted-foreground">
          {now
            ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
            : " "}
        </div>
      </div>

      <StatBlock icon={<ClipboardList className="size-6" />} value={activeOrders} label="Active Orders" tone="secondary" />
      <StatBlock icon={<AlertTriangle className="size-6" />} value={delayedOrders} label="Delayed Orders" tone="destructive" />
      <StatBlock icon={<Users className="size-6" />} value={employeesWorking} label="Employees Working" tone="success" />
    </header>
  );
}

function StatBlock({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: "secondary" | "destructive" | "success";
}) {
  const toneClasses = {
    secondary: "bg-secondary/10 text-secondary",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/10 text-success",
  }[tone];

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-1.5">
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${toneClasses}`}>{icon}</div>
      <div>
        <div className="font-mono text-3xl font-extrabold tabular-nums leading-none">{value}</div>
        <div className="mt-0.5 text-sm font-semibold text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
