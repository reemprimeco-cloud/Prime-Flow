"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AlertTriangle, ClipboardList, Users } from "lucide-react";

import { cn } from "@/lib/utils";

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
    // force the stats track to the same width as the much narrower time
    // block, which once truncated "Active Orders" on the real TV. Time and
    // stats each take the width their content needs (shrink-0); the logo
    // group is the one flexible element and absorbs whatever's left.
    <header className="flex items-center gap-[1.5rem] rounded-[1.1rem] bg-card px-[1.6rem] py-[0.9rem] shadow-[0_0.25rem_1rem_-0.25rem_rgba(10,31,68,0.25)]">
      <div className="shrink-0">
        <div className="text-[3rem] leading-none font-extrabold tracking-tight tabular-nums">
          {now ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "--:--"}
        </div>
        <div className="mt-[0.35rem] text-[1.15rem] font-semibold text-muted-foreground">
          {now ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : " "}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-[1.2rem] overflow-hidden px-[0.5rem]">
        <div className="relative h-[3.6rem] w-[7.5rem] shrink-0">
          <Image src="/logo-mark.png" alt="Prime Printing Co." fill sizes="240px" className="object-contain" priority />
        </div>
        {/* Echoes the logo's wide-tracked uppercase lettering with the
            system font stack -- the app loads no webfonts, so shop-floor
            screens never wait on one. Truncates (the logo never does) when
            a narrow screen squeezes this group. */}
        <span className="min-w-0 truncate border-l-2 border-border pl-[1.2rem] text-[2.2rem] leading-none font-extrabold tracking-[0.08em] text-primary uppercase">
          Production Board
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-[0.8rem]">
        <StatBlock icon={ClipboardList} value={activeOrders} label="Active orders" tone="secondary" />
        <StatBlock icon={AlertTriangle} value={delayedOrders} label="Late" tone={delayedOrders > 0 ? "alert" : "quiet"} />
        <StatBlock icon={Users} value={employeesWorking} label="Working now" tone="success" />
      </div>
    </header>
  );
}

const TONES = {
  secondary: { box: "border-border", icon: "bg-secondary/10 text-secondary", label: "text-muted-foreground" },
  success: { box: "border-border", icon: "bg-success/10 text-success", label: "text-muted-foreground" },
  quiet: { box: "border-border", icon: "bg-muted text-muted-foreground", label: "text-muted-foreground" },
  // Late orders are the one number the floor must not miss: solid red.
  alert: { box: "border-red-700 bg-red-700 text-white", icon: "bg-white/20 text-white", label: "text-white/90" },
} as const;

function StatBlock({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Users;
  value: number;
  label: string;
  tone: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <div className={cn("flex min-w-0 items-center gap-[0.75rem] rounded-[0.9rem] border-2 px-[0.9rem] py-[0.5rem]", t.box)}>
      <div className={cn("flex size-[2.8rem] shrink-0 items-center justify-center rounded-[0.7rem]", t.icon)}>
        <Icon className="size-[1.5rem]" aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="text-[2.2rem] leading-none font-extrabold tabular-nums">{value}</div>
        <div className={cn("mt-[0.2rem] truncate text-[1rem] font-semibold", t.label)}>{label}</div>
      </div>
    </div>
  );
}
