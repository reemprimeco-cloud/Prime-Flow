"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bell,
  CircleDot,
  FilePlus,
  Loader2,
  PackagePlus,
  PackageCheck,
  PackageX,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";

import { getOrderTimeline, type TimelineEntry } from "@/lib/actions/timeline";
import type { AuditAction } from "@/types/database.types";

const ACTION_ICONS: Record<AuditAction, React.ComponentType<{ className?: string }>> = {
  order_created: FilePlus,
  order_updated: FilePlus,
  order_deleted: Trash2,
  employee_assigned: UserPlus,
  employee_unassigned: UserMinus,
  status_changed: CircleDot,
  material_requested: PackagePlus,
  material_approved: PackageCheck,
  material_rejected: PackageX,
  notification_sent: Bell,
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m later`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m later` : `${hours}h later`;
}

export function OrderTimeline({ orderId }: { orderId: string }) {
  const { data: entries, isLoading } = useQuery({
    queryKey: ["order-timeline", orderId],
    queryFn: () => getOrderTimeline(orderId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No recorded events for this order yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-4 border-l border-border pl-4">
      {entries.map((entry: TimelineEntry) => {
        const Icon = ACTION_ICONS[entry.action] ?? CircleDot;
        return (
          <li key={entry.id} className="relative">
            <span className="absolute -left-[25px] flex size-5 items-center justify-center rounded-full bg-secondary/15 text-secondary">
              <Icon className="size-3" />
            </span>
            <p className="text-sm font-medium text-foreground">{entry.label}</p>
            <p className="text-xs text-muted-foreground">
              {entry.actorName} · {format(new Date(entry.timestamp), "MMM d, h:mm a")}
              {entry.minutesSincePrevious != null && ` · ${formatDuration(entry.minutesSincePrevious)}`}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
