import { NextResponse } from "next/server";
import { endOfMonth, startOfMonth, subMonths, format } from "date-fns";

import { createServiceClient } from "@/lib/supabase/server";
import { assertValidTransition } from "@/lib/status/engine";
import { recordAuditLog } from "@/lib/audit/log";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { computeMonthlyStatistics } from "@/lib/reports/compute-monthly-stats";
import type { OrderStatus } from "@/types/database.types";

/**
 * Closes out the previous calendar month: orders sitting in `collected` or
 * `delivered` become `completed` + `archived` (the collected/delivered ->
 * completed transition the status engine has modeled since Phase 5 but
 * nothing triggered until now — see docs/STATUS_ENGINE.md), and a
 * monthly_statistics row is generated for Reports.
 *
 * Orders that never reached a terminal status are left alone — silently
 * force-completing unfinished work would misrepresent what actually
 * happened, so they just stay on the Manager Dashboard until finished.
 *
 * Intended to run on a schedule (e.g. Vercel Cron, once on the 1st of each
 * month) — protected by CRON_SECRET, not employee auth.
 */

const TERMINAL_READY_FOR_ARCHIVE: OrderStatus[] = ["collected", "delivered"];

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const closedMonthStart = startOfMonth(subMonths(now, 1));
  const closedMonthEnd = endOfMonth(closedMonthStart);
  const startIso = format(closedMonthStart, "yyyy-MM-dd");
  const endIso = format(closedMonthEnd, "yyyy-MM-dd");

  const { data: monthOrders, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, paper, delivery_date, delivery_time, created_at, completed_at, archived")
    .gte("delivery_date", startIso)
    .lte("delivery_date", endIso);
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const toArchive = (monthOrders ?? []).filter(
    (o) => !o.archived && TERMINAL_READY_FOR_ARCHIVE.includes(o.status)
  );

  let archived = 0;
  for (const order of toArchive) {
    try {
      assertValidTransition(order.status, "completed");
    } catch {
      continue; // shouldn't happen given the filter above, but never trust it blindly
    }

    const completedAt = now.toISOString();
    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: "completed", archived: true, completed_at: completedAt })
      .eq("id", order.id);
    if (updateError) {
      console.error(`[month-end] failed to archive order ${order.id}`, updateError);
      continue;
    }

    await supabase.from("order_status_history").insert({
      order_id: order.id,
      from_status: order.status,
      to_status: "completed",
      changed_by: null,
    });

    await recordAuditLog({
      actorId: null,
      actorName: "System (month-end archive)",
      action: "status_changed",
      entityType: "order",
      entityId: order.id,
      orderId: order.id,
      oldValue: { status: order.status },
      newValue: { status: "completed", archived: true },
    });

    order.status = "completed";
    order.completed_at = completedAt;
    archived++;
  }

  const stats = await computeMonthlyStatistics(supabase, monthOrders ?? [], closedMonthStart, {
    isClosedMonth: true,
  });

  const { error: upsertError } = await supabase.from("monthly_statistics").upsert(
    {
      year: closedMonthStart.getFullYear(),
      month: closedMonthStart.getMonth() + 1,
      total_orders: stats.totalOrders,
      completed_orders: stats.completedOrders,
      delayed_orders: stats.delayedOrders,
      orders_per_employee: stats.ordersPerEmployee,
      avg_completion_minutes: stats.avgCompletionMinutes,
      most_used_paper: stats.mostUsedPaper,
      most_requested_material: stats.mostRequestedMaterial,
      generated_at: now.toISOString(),
    },
    { onConflict: "year,month" }
  );
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  if (archived > 0) {
    await broadcast(CHANNELS.production, "order.archived", { count: archived });
  }

  return NextResponse.json({
    closedMonth: format(closedMonthStart, "yyyy-MM"),
    ordersInMonth: monthOrders?.length ?? 0,
    archived,
    stats,
  });
}
