"use server";

import { differenceInMinutes } from "date-fns";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoOrderTimeline } from "@/lib/demo/data";
import { describeAuditEntry } from "@/lib/timeline/describe";
import type { AuditAction } from "@/types/database.types";

export interface TimelineEntry {
  id: string;
  timestamp: string;
  actorName: string;
  action: AuditAction;
  label: string;
  minutesSincePrevious: number | null;
}

/**
 * The Live Production Timeline is a read of audit_logs filtered to one
 * order — every event type the spec asks for (created, assigned, status
 * changes, material requests/approval, notifications, deletion) is already
 * captured there since Phase 5, so this is a formatting layer, not a new
 * data source.
 */
export async function getOrderTimeline(orderId: string): Promise<TimelineEntry[]> {
  await requireAdmin();
  if (isDemoMode()) return getDemoOrderTimeline(orderId);
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  let previous: Date | null = null;
  return (data ?? []).map((row) => {
    const timestamp = row.created_at;
    const minutesSincePrevious = previous ? differenceInMinutes(new Date(timestamp), previous) : null;
    previous = new Date(timestamp);
    return {
      id: row.id,
      timestamp,
      actorName: row.actor_name,
      action: row.action,
      label: describeAuditEntry(row.action, row.old_value, row.new_value),
      minutesSincePrevious,
    };
  });
}
