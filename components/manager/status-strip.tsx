"use client";

import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/actions/orders";

export type StatusStripKey = "late" | "new" | "inProgress" | "waitingMaterials" | "readyPickup" | "readyDelivery";

interface Segment {
  key: Exclude<StatusStripKey, "late">;
  label: string;
  /** Status dot — the same hue the order's status chip uses. */
  dot: string;
}

const SEGMENTS: Segment[] = [
  { key: "new", label: "New", dot: "bg-secondary" },
  { key: "inProgress", label: "In progress", dot: "bg-warning" },
  { key: "waitingMaterials", label: "Waiting for materials", dot: "bg-destructive" },
  { key: "readyPickup", label: "Ready for pickup", dot: "bg-success" },
  { key: "readyDelivery", label: "Ready for delivery", dot: "bg-success" },
];

interface StatusStripProps {
  stats?: DashboardStats;
  isLoading?: boolean;
  /** Jump to that part of the board (or filter the list to it). */
  onSelect: (key: StatusStripKey) => void;
}

/**
 * One slim, clickable row of live counts — replaces the seven equal-weight
 * stat tiles. Late leads (and only appears) when something is late; the
 * month's completed total is a reporting number, so it sits apart as quiet
 * text rather than competing with the live counts.
 */
export function StatusStrip({ stats, isLoading, onSelect }: StatusStripProps) {
  const value = (key: keyof DashboardStats) => (isLoading || !stats ? "—" : stats[key]);
  const late = stats?.delayed ?? 0;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <nav
        aria-label="Orders by status"
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-thin sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {late > 0 && (
          <button
            type="button"
            onClick={() => onSelect("late")}
            className="flex h-11 shrink-0 snap-start items-center gap-2 rounded-xl bg-red-700 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="text-base font-bold tabular-nums">{late}</span>
            Late
          </button>
        )}
        {SEGMENTS.map(({ key, label, dot }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={cn(
              "flex h-11 shrink-0 snap-start items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <span className={cn("size-2 rounded-full", dot)} aria-hidden />
            <span className="text-base font-bold text-foreground tabular-nums">{value(key)}</span>
            {label}
          </button>
        ))}
      </nav>
      <p className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:block">
        <span className="font-semibold text-foreground">{value("completedThisMonth")}</span> completed this month
      </p>
    </div>
  );
}
