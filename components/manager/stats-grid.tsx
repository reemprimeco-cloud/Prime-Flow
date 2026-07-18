import { AlertTriangle, CheckCircle2, Clock, PackageX, Sparkles, Timer, Truck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/actions/orders";

interface StatDef {
  key: keyof DashboardStats;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warning" | "danger" | "success";
}

const STAT_DEFS: StatDef[] = [
  { key: "new", label: "New Orders", icon: Sparkles },
  { key: "inProgress", label: "In Progress", icon: Timer, tone: "default" },
  { key: "waitingMaterials", label: "Waiting for Materials", icon: PackageX, tone: "warning" },
  { key: "readyPickup", label: "Ready for Pickup", icon: CheckCircle2, tone: "success" },
  { key: "readyDelivery", label: "Ready for Delivery", icon: Truck, tone: "success" },
  { key: "completedThisMonth", label: "Completed This Month", icon: Clock },
  { key: "delayed", label: "Delayed Orders", icon: AlertTriangle, tone: "danger" },
];

const TONE_CLASSES: Record<NonNullable<StatDef["tone"]>, string> = {
  default: "bg-secondary/15 text-secondary",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
  success: "bg-success/15 text-success",
};

export function StatsGrid({ stats, isLoading }: { stats?: DashboardStats; isLoading?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {STAT_DEFS.map(({ key, label, icon: Icon, tone = "default" }) => (
        <Card key={key} className="flex flex-col gap-2.5 p-4">
          <div className={cn("flex size-8 items-center justify-center rounded-lg", TONE_CLASSES[tone])}>
            <Icon className="size-4" />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums leading-none">
              {isLoading ? "—" : stats?.[key] ?? 0}
            </div>
            <div className="mt-1.5 text-xs leading-tight text-muted-foreground">{label}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}
