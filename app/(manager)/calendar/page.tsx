import type { Metadata } from "next";
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";

import { requireAdmin } from "@/lib/auth/guards";
import { listCalendarOrders } from "@/lib/actions/calendar";
import { CalendarClient } from "@/components/manager/calendar-client";

export const metadata: Metadata = {
  title: "Calendar — Prime Production Board",
};

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  await requireAdmin();
  const now = new Date();
  const start = startOfWeek(startOfMonth(now));
  const end = endOfWeek(endOfMonth(now));
  const orders = await listCalendarOrders(format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"));

  return <CalendarClient initialOrders={orders} />;
}
