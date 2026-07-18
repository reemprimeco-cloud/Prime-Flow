"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  PackageSearch,
  Timer,
  Truck,
  UserCheck,
  Warehouse,
} from "lucide-react";

import { getOperationsKpis } from "@/lib/actions/operations";
import { listRecentActivity } from "@/lib/actions/activity";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { CHANNELS } from "@/lib/realtime/constants";
import { Card } from "@/components/ui/card";
import { ActivityFeed } from "@/components/manager/activity-feed";

function formatMinutes(minutes: number | null): string {
  if (minutes == null) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

interface OperationsClientProps {
  initialKpis: Awaited<ReturnType<typeof getOperationsKpis>>;
  initialActivity: Awaited<ReturnType<typeof listRecentActivity>>;
}

export function OperationsClient({ initialKpis, initialActivity }: OperationsClientProps) {
  const queryClient = useQueryClient();

  const kpisQuery = useQuery({
    queryKey: ["operations-kpis"],
    queryFn: () => getOperationsKpis(),
    initialData: initialKpis,
    refetchInterval: 30_000,
  });

  useRealtimeChannel(CHANNELS.production, () => queryClient.invalidateQueries({ queryKey: ["operations-kpis"] }));
  useRealtimeChannel(CHANNELS.materialRequests, () => queryClient.invalidateQueries({ queryKey: ["operations-kpis"] }));

  const kpis = kpisQuery.data ?? initialKpis;

  const cards = [
    { label: "Orders in Production", value: kpis.ordersInProduction, icon: Gauge, tone: "default" as const },
    { label: "Orders Delayed", value: kpis.ordersDelayed, icon: AlertTriangle, tone: "danger" as const },
    { label: "Avg Production Time", value: formatMinutes(kpis.avgProductionMinutes), icon: Timer, tone: "default" as const },
    { label: "Pending Material Requests", value: kpis.pendingMaterialRequests, icon: PackageSearch, tone: "warning" as const },
    { label: "Employee Utilization", value: `${kpis.employeeUtilizationPercent}%`, icon: UserCheck, tone: "default" as const },
    { label: "Completion Rate", value: `${kpis.completionRatePercent}%`, icon: CheckCircle2, tone: "success" as const },
    { label: "Today's Deliveries", value: kpis.todaysDeliveries, icon: Truck, tone: "success" as const },
    { label: "Today's Pickups", value: kpis.todaysPickups, icon: Warehouse, tone: "success" as const },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operations</h1>
        <p className="text-sm text-muted-foreground">Live shop-wide KPIs and activity</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="flex flex-col gap-2.5 p-4">
            <div
              className={`flex size-8 items-center justify-center rounded-lg ${
                tone === "danger"
                  ? "bg-destructive/15 text-destructive"
                  : tone === "warning"
                    ? "bg-warning/15 text-warning"
                    : tone === "success"
                      ? "bg-success/15 text-success"
                      : "bg-secondary/15 text-secondary"
              }`}
            >
              <Icon className="size-4" />
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
              <div className="mt-1.5 text-xs leading-tight text-muted-foreground">{label}</div>
            </div>
          </Card>
        ))}
      </div>

      <ActivityFeed initialEntries={initialActivity} />
    </div>
  );
}
