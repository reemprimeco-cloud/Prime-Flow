"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Bell, Loader2, RotateCw, Search } from "lucide-react";

import {
  listNotificationLogs,
  manualResendNotification,
  type NotificationLogItem,
} from "@/lib/actions/notifications";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { CHANNELS } from "@/lib/realtime/constants";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { NotificationChannel, NotificationReceiver, NotificationStatus } from "@/types/database.types";

const MAX_AUTO_RETRIES = 5;

type TabKey = "all" | "sent" | "pending" | "failed" | "retry-queue";

/** "Sent" covers every status a delivery-status callback can only improve on from here. */
const SENT_LIKE_STATUSES: NotificationStatus[] = ["sent", "delivered", "read"];
/** "Failed" covers both of Twilio's terminal failure statuses. */
const FAILED_LIKE_STATUSES: NotificationStatus[] = ["failed", "undelivered"];

const STATUS_BADGE_VARIANT: Record<NotificationStatus, "success" | "warning" | "destructive" | "muted"> = {
  sent: "success",
  delivered: "success",
  read: "success",
  pending: "warning",
  queued: "warning",
  accepted: "warning",
  failed: "destructive",
  undelivered: "destructive",
  skipped: "muted",
};

export function NotificationCenterClient({ initialLogs }: { initialLogs: NotificationLogItem[] }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [receiverFilter, setReceiverFilter] = useState<NotificationReceiver | "all">("all");
  const [channelFilter, setChannelFilter] = useState<NotificationChannel | "all">("all");
  const [dateFilter, setDateFilter] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);

  const logsQuery = useQuery({
    queryKey: ["notification-logs"],
    queryFn: () => listNotificationLogs(),
    initialData: initialLogs,
    refetchInterval: 30_000,
  });

  useRealtimeChannel(CHANNELS.notifications, () => {
    queryClient.invalidateQueries({ queryKey: ["notification-logs"] });
  });

  const logs = logsQuery.data ?? initialLogs;

  const tabCounts = useMemo(
    () => ({
      all: logs.length,
      sent: logs.filter((l) => SENT_LIKE_STATUSES.includes(l.status)).length,
      pending: logs.filter((l) => l.status === "pending").length,
      failed: logs.filter((l) => FAILED_LIKE_STATUSES.includes(l.status)).length,
      "retry-queue": logs.filter((l) => FAILED_LIKE_STATUSES.includes(l.status) && l.retryCount < MAX_AUTO_RETRIES)
        .length,
    }),
    [logs]
  );

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (tab === "sent" && !SENT_LIKE_STATUSES.includes(log.status)) return false;
      if (tab === "pending" && log.status !== "pending") return false;
      if (tab === "failed" && !FAILED_LIKE_STATUSES.includes(log.status)) return false;
      if (tab === "retry-queue" && !(FAILED_LIKE_STATUSES.includes(log.status) && log.retryCount < MAX_AUTO_RETRIES))
        return false;

      if (receiverFilter !== "all" && log.receiverType !== receiverFilter) return false;
      if (channelFilter !== "all" && log.channel !== channelFilter) return false;
      if (dateFilter && !log.createdAt.startsWith(dateFilter)) return false;

      if (search.trim()) {
        const term = search.trim().toLowerCase();
        const haystack = [log.recipientName, log.phone, log.orderNumber, log.templateName].join(" ").toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      return true;
    });
  }, [logs, tab, receiverFilter, channelFilter, dateFilter, search]);

  const handleResend = (log: NotificationLogItem) => {
    setResendingId(log.id);
    manualResendNotification(log.id)
      .then(() => {
        toast.success(`Resent to ${log.recipientName ?? log.phone}`);
        queryClient.invalidateQueries({ queryKey: ["notification-logs"] });
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to resend"))
      .finally(() => setResendingId(null));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notification Center</h1>
        <p className="text-sm text-muted-foreground">
          {tabCounts.failed} failed · {tabCounts.pending} pending · {logs.length} total
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
          <TabsTrigger value="sent">Sent ({tabCounts.sent})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({tabCounts.pending})</TabsTrigger>
          <TabsTrigger value="failed">Failed ({tabCounts.failed})</TabsTrigger>
          <TabsTrigger value="retry-queue">Retry Queue ({tabCounts["retry-queue"]})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, employee, phone, order #..."
            className="pl-9"
          />
        </div>
        <Select value={receiverFilter} onValueChange={(v) => setReceiverFilter(v as NotificationReceiver | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Recipient" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Recipients</SelectItem>
            <SelectItem value="customer">Customers</SelectItem>
            <SelectItem value="employee">Employees</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as NotificationChannel | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-40" />
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Bell className="size-6" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No notifications here</p>
            <p className="text-sm text-muted-foreground">Try a different tab or clear your filters.</p>
          </div>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Provider Response</TableHead>
              <TableHead>Retries</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-muted-foreground">{format(new Date(log.createdAt), "MMM d, h:mm a")}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{log.recipientName ?? "Unknown"}</span>
                    <span className="text-xs text-muted-foreground">
                      {log.phone} · {log.receiverType === "customer" ? "Customer" : "Employee"}
                      {log.orderNumber ? ` · ${log.orderNumber}` : ""}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="capitalize">{log.channel}</TableCell>
                <TableCell className="font-mono text-xs">{log.templateName}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[log.status]}>{log.status}</Badge>
                  {log.error && <p className="mt-1 max-w-[200px] truncate text-xs text-destructive">{log.error}</p>}
                </TableCell>
                <TableCell className="max-w-[200px] truncate font-mono text-xs text-muted-foreground">
                  {log.providerResponse ? JSON.stringify(log.providerResponse) : "—"}
                </TableCell>
                <TableCell>{log.retryCount}</TableCell>
                <TableCell>
                  {(FAILED_LIKE_STATUSES.includes(log.status) || log.status === "skipped") && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={resendingId === log.id}
                      onClick={() => handleResend(log)}
                    >
                      {resendingId === log.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RotateCw className="size-3.5" />
                      )}
                      Resend
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
