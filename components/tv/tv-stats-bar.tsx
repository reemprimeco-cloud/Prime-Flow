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
    // flex, not grid-cols-[1fr_auto_1fr]: equal-width flanking *columns*
    // sounds like it'd center the logo, but it forces the stats track to
    // the same width as the much narrower time block, which is what was
    // actually truncating "Active Orders" down to "Active Or..." on the
    // real TV -- the time column had spare room it wasn't using while the
    // stats column was starved right next to it. Here `time` and `stats`
    // each just take the width their own content needs (shrink-0, never
    // squeezed), and the logo+Dashboard group is the one flexible element
    // that absorbs whatever's left via flex-1 + justify-center -- it's
    // usually near-centered since time/date and 3 stat blocks are
    // reasonably close in width, but stats staying fully readable matters
    // more than the logo sitting at the mathematically exact midpoint.
    <header className="flex items-center gap-4 border-b-2 border-border bg-card px-6 py-3.5">
      <div className="shrink-0">
        <div className="font-mono text-4xl font-extrabold tabular-nums leading-none">
          {now ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "--:--"}
        </div>
        <div className="mt-1 text-base font-semibold text-muted-foreground">
          {now
            ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
            : " "}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-4 overflow-hidden px-2">
        <div className="relative h-14 w-[120px] shrink-0">
          <Image src="/logo-mark.png" alt="Prime Printing Co." fill sizes="120px" className="object-contain" priority />
        </div>
        {/* Echoes the logo's own geometric-sans, wide-tracked, uppercase
            treatment (see "PRINTING CO." in public/logo-mark.png) using the
            system font stack rather than a matching webfont -- this app
            deliberately loads no webfonts (see --font-sans above) to avoid
            a render-blocking fetch on shop-floor tablets, and that holds
            for the TV board too. Sized to match the logo's own h-14
            height rather than sitting small next to it. `min-w-0` +
            `truncate` so on a narrow screen this shrinks and ellipsizes
            instead of overflowing into the time block next to it --  the
            logo (shrink-0, fixed width) never budges, this is the one
            element that gives. */}
        <span className="min-w-0 truncate border-l border-border pl-4 text-4xl leading-none font-extrabold tracking-[0.08em] text-primary uppercase">
          Dashboard
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
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
