import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import type { AuditAction } from "@/types/database.types";

export interface AuditLogEntry {
  actorId: string;
  actorName: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  orderId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Records one audit trail entry. Never throws — an audit-log failure must
 * never fail the mutation that triggered it (same philosophy as
 * lib/realtime/channels.ts's broadcast()). No-ops in Demo Mode since writes
 * are disabled there.
 */
export async function recordAuditLog(entry: AuditLogEntry): Promise<void> {
  if (isDemoMode()) return;

  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("audit_logs").insert({
      actor_id: entry.actorId,
      actor_name: entry.actorName,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      order_id: entry.orderId ?? null,
      old_value: (entry.oldValue as never) ?? null,
      new_value: (entry.newValue as never) ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error(`[audit] failed to record ${entry.action}`, error);
  }
}
