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
    <header className="relative flex items-center gap-4 border-b-2 border-border bg-card px-6 py-3.5">
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

      {/* True center of the header bar, independent of how wide the time
          block or stat row end up -- absolute + translate rather than a
          grid column, so it stays dead-center regardless. Uses
          logo-mark.png (a tight crop of public/logo.jpg's wordmark, no
          surrounding whitespace -- see the crop step that produced it)
          rather than the shared logo.jpg every other screen uses, sized to
          the header's own height instead of a fixed small square. */}
      <div className="absolute left-1/2 top-1/2 h-16 w-[140px] -translate-x-1/2 -translate-y-1/2">
        <Image src="/logo-mark.png" alt="Prime Printing Co." fill sizes="140px" className="object-contain" priority />
      </div>

      <div className="flex flex-1 items-center justify-end gap-4">
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
    <div className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-1.5">
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${toneClasses}`}>{icon}</div>
      <div>
        <div className="font-mono text-3xl font-extrabold tabular-nums leading-none">{value}</div>
        <div className="mt-0.5 text-sm font-semibold text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
