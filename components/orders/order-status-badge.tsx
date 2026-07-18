import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/types/domain";
import type { OrderStatus } from "@/types/database.types";

const STATUS_STYLES: Record<OrderStatus, string> = {
  new: "bg-secondary/15 text-secondary border-secondary/30",
  in_progress: "bg-warning/15 text-warning border-warning/30",
  waiting_materials: "bg-destructive/15 text-destructive border-destructive/30",
  ready_pickup: "bg-success/15 text-success border-success/30",
  ready_delivery: "bg-success/15 text-success border-success/30",
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
