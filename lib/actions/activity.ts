"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoActivityFeed } from "@/lib/demo/data";
import { describeAuditEntry } from "@/lib/timeline/describe";
import type { AuditAction } from "@/types/database.types";

export interface ActivityEntry {
  id: string;
  timestamp: string;
  actorName: string;
  action: AuditAction;
  label: string;
  orderNumber: string | null;
}

/** Shop-wide feed — same audit_logs source as the per-order timeline, just unfiltered and capped. */
export async function listRecentActivity(limit = 40): Promise<ActivityEntry[]> {
  await requireAdmin();
  if (isDemoMode()) return getDemoActivityFeed(limit);
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  const orderIds = [...new Set(data.map((row) => row.order_id).filter((id): id is string => !!id))];
  const orderNumberById = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: orders } = await supabase.from("orders").select("id, order_number").in("id", orderIds);
    for (const o of orders ?? []) orderNumberById.set(o.id, o.order_number);
  }

  return data.map((row) => ({
    id: row.id,
    timestamp: row.created_at,
    actorName: row.actor_name,
    action: row.action,
    label: describeAuditEntry(row.action, row.old_value, row.new_value),
    orderNumber: row.order_id ? orderNumberById.get(row.order_id) ?? null : null,
  }));
}
