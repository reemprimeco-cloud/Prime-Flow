import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { listNotificationLogs } from "@/lib/actions/notifications";
import { NotificationCenterClient } from "@/components/manager/notification-center-client";

export const metadata: Metadata = {
  title: "Notification Center — Prime Production Board",
};

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireAdmin();
  const logs = await listNotificationLogs();

  return <NotificationCenterClient initialLogs={logs} />;
}
