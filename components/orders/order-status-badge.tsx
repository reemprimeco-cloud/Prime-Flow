import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/types/domain";
import type { OrderStatus } from "@/types/database.types";

const STATUS_STYLES: Record<OrderStatus, string> = {
  new: "bg-secondary/15 text-secondary border-secondary/30",
  // Dark ink on each tint: the full-strength status colours measure
  // 1.9–3.1:1 on their own 15% tint, under the 4.5:1 a label needs.
  in_progress: "bg-warning/15 text-amber-800 border-warning/30",
  ready_internal_pickup: "bg-secondary/15 text-secondary border-secondary/30",
  waiting_materials: "bg-destructive/10 text-red-700 border-destructive/30",
  ready_pickup: "bg-success/15 text-green-800 border-success/30",
  ready_delivery: "bg-success/15 text-green-800 border-success/30",
  collected: "bg-muted text-muted-foreground border-transparent",
  delivered: "bg-muted text-muted-foreground border-transparent",
  completed: "bg-muted text-muted-foreground border-transparent",
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[status], className)}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}
