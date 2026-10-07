"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Link2,
  MessageCircle,
  Radio,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { getDiagnosticsSnapshot, type DiagnosticsSnapshot } from "@/lib/actions/diagnostics";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { getChannelStatus } from "@/lib/realtime/manager";
import { CHANNELS } from "@/lib/realtime/constants";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function useRealtimeStatus(): string {
  const [status, setStatus] = useState("SUBSCRIBING");
  useRealtimeChannel(CHANNELS.production, () => {});

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(getChannelStatus(CHANNELS.production) ?? "UNKNOWN");
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return status;
}

function StatusRow({
  icon: Icon,
  label,
  status,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  status: "ok" | "warning" | "error";
  detail: string;
}) {
  const StatusIcon = status === "ok" ? CheckCircle2 : status === "warning" ? AlertCircle : XCircle;
  const color = status === "ok" ? "text-success" : status === "warning" ? "text-warning" : "text-destructive";

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-3 last:border-0">
      <div className="flex items-center gap-3">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{detail}</span>
        <StatusIcon className={`size-4 ${color}`} />
      </div>
    </div>
  );
}

export function DiagnosticsClient({ initialSnapshot }: { initialSnapshot: DiagnosticsSnapshot }) {
  const realtimeStatus = useRealtimeStatus();

  const query = useQuery({
    queryKey: ["diagnostics"],
    queryFn: () => getDiagnosticsSnapshot(),
    initialData: initialSnapshot,
    refetchInterval: 15_000,
  });

  const snapshot = query.data ?? initialSnapshot;

  // The QuickBooks OAuth callback lands back here with ?quickbooks=connected|error.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("quickbooks");
    if (!result) return;
    if (result === "connected") toast.success("QuickBooks connected — paid invoices will now import as orders");
    else toast.error(params.get("message") || "QuickBooks connection failed");
    window.history.replaceState({}, "", window.location.pathname);
    query.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qb = snapshot.quickbooks;
  const qbStatus: "ok" | "warning" | "error" = !qb.configured ? "warning" : qb.connected ? "ok" : "error";
  const qbDetail = !qb.configured
    ? "Not configured"
    : qb.connected
      ? `Connected · company ${qb.realmId}`
      : qb.realmId
        ? "Connection expired — reconnect"
        : "Not connected";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          System health · last checked {new Date(snapshot.timestamp).toLocaleTimeString()}
        </p>
      </div>

      <Card className="flex flex-col p-5">
        <StatusRow
          icon={Radio}
          label="Realtime Status"
          status={realtimeStatus === "SUBSCRIBED" ? "ok" : realtimeStatus === "SUBSCRIBING" ? "warning" : "error"}
          detail={realtimeStatus}
        />
        <StatusRow
          icon={Database}
          label="Database Connection"
          status={snapshot.databaseConnected ? "ok" : "error"}
          detail={snapshot.databaseConnected ? "Connected" : "Unreachable"}
        />
        <StatusRow
          icon={Zap}
          label="Supabase Latency"
          status={
            snapshot.supabaseLatencyMs == null
              ? "error"
              : snapshot.supabaseLatencyMs < 300
                ? "ok"
                : snapshot.supabaseLatencyMs < 800
                  ? "warning"
                  : "error"
          }
          detail={snapshot.supabaseLatencyMs != null ? `${snapshot.supabaseLatencyMs}ms` : "N/A"}
        />
        <StatusRow
          icon={MessageCircle}
          label="Twilio Status"
          status={snapshot.twilioConfigured ? "ok" : "warning"}
          detail={snapshot.twilioConfigured ? "Configured" : "Not configured (stub-safe)"}
        />
        <StatusRow
          icon={AlertCircle}
          label="Notification Queue"
          status={snapshot.notificationQueueFailed > 0 ? "warning" : "ok"}
          detail={`${snapshot.notificationQueuePending} pending · ${snapshot.notificationQueueFailed} failed`}
        />
        <StatusRow
          icon={Users}
          label="Active Users (last 15 min)"
          status="ok"
          detail={String(snapshot.activeUsersApprox)}
        />
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">Integrations</h2>
        </div>
        <StatusRow icon={Link2} label="QuickBooks Online" status={qbStatus} detail={qbDetail} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {qb.configured
              ? "Paid invoices import onto the board as new, unapproved orders. Connecting is a one-time step; reconnect if it expires."
              : "Set QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET on the host, then connect here. See docs/QUICKBOOKS.md."}
          </p>
          {qb.configured && (
            <Button asChild variant={qb.connected ? "outline" : "primary"} size="sm">
              <a href="/api/integrations/quickbooks/connect">{qb.connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}</a>
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-5 text-sm text-muted-foreground">
        <p>
          <Badge variant="muted" className="mr-2">
            Note
          </Badge>
          &quot;Active Users&quot; approximates who&apos;s been active from the audit trail (no session-tracking table
          exists) — it counts distinct actors in the last 15 minutes, not open browser tabs. See{" "}
          <span className="font-mono">docs/OPERATIONS.md</span> for details on every metric here.
        </p>
      </Card>
    </div>
  );
}
