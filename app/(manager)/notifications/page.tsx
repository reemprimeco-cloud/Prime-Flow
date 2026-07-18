import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { format } from "date-fns";

import { requireAdmin } from "@/lib/auth/guards";
import { listNotificationLogs } from "@/lib/actions/notifications";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Notifications — Prime Production Board",
};

const STATUS_VARIANT = {
  sent: "success",
  delivered: "success",
  pending: "warning",
  failed: "destructive",
  skipped: "muted",
} as const;

export default async function NotificationsPage() {
  await requireAdmin();
  const logs = await listNotificationLogs();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">WhatsApp notification log — most recent 200</p>
      </div>

      {logs.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Bell className="size-6" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No notifications sent yet</p>
            <p className="text-sm text-muted-foreground">
              Customer and employee WhatsApp updates will be logged here once Twilio is connected.
            </p>
          </div>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Retries</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono text-xs">{log.orderNumber ?? "—"}</TableCell>
                <TableCell>
                  {log.phone} <span className="text-muted-foreground">({log.receiverType})</span>
                </TableCell>
                <TableCell>{log.templateName}</TableCell>
                <TableCell>{log.language === "ar" ? "Arabic" : "English"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[log.status]}>{log.status}</Badge>
                </TableCell>
                <TableCell>{log.retryCount}</TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(log.createdAt), "MMM d, h:mm a")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
