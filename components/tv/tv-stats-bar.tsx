"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
    // Real grid columns, not an absolutely-positioned overlay -- the logo
    // previously floated at the literal viewport center with no reserved
    // space of its own, so on any screen narrower than what this was
    // tested at, it landed directly on top of the stat blocks instead of
    // between them. A dedicated `auto` column guarantees the logo and the
    // stats never share the same pixels, at any width.
    <header className="grid grid-cols-[auto_auto_1fr] items-center gap-4 border-b-2 border-border bg-card px-6 py-3.5">
      <div className="min-w-0">
        <div className="font-mono text-4xl font-extrabold tabular-nums leading-none">
          {now ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "--:--"}
        </div>
        <div className="mt-1 text-base font-semibold text-muted-foreground">
          {now
            ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
            : " "}
        </div>
      </div>

      <div className="relative h-14 w-[120px] shrink-0 px-4">
        <Image src="/logo-mark.png" alt="Prime Printing Co." fill sizes="120px" className="object-contain" priority />
      </div>

      <div className="flex min-w-0 items-center justify-end gap-3">
        <StatBlock icon={<ClipboardList className="size-6" />} value={activeOrders} label="Active Orders" tone="secondary" />
        <StatBlock icon={<AlertTriangle className="size-6" />} value={delayedOrders} label="Delayed Orders" tone="destructive" />
        <StatBlock icon={<Users className="size-6" />} value={employeesWorking} label="Employees Working" tone="success" />
      </div>
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
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border px-3.5 py-1.5">
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${toneClasses}`}>{icon}</div>
      <div className="min-w-0">
        <div className="font-mono text-3xl font-extrabold tabular-nums leading-none">{value}</div>
        <div className="mt-0.5 truncate text-sm font-semibold text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
