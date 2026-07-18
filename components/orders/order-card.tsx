"use client";

import { ImageIcon, MoreVertical, Copy, Pencil, Trash2, PackageSearch, Eye } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CountdownTimer, useCountdownColor } from "@/components/orders/countdown-timer";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { EmployeeChips } from "@/components/orders/employee-chips";
import { cn } from "@/lib/utils";
import { DELAYABLE_STATUSES } from "@/types/domain";
import type { OrderListItem } from "@/lib/actions/orders";

const ACCENT_BORDER = {
  green: "before:bg-success",
  yellow: "before:bg-warning",
  orange: "before:bg-warning",
  red: "before:bg-destructive",
} as const;

interface OrderCardProps {
  order: OrderListItem;
  onOpen: (order: OrderListItem) => void;
  onEdit: (order: OrderListItem) => void;
  onDuplicate: (order: OrderListItem) => void;
  onDelete: (order: OrderListItem) => void;
}

export function OrderCard({ order, onOpen, onEdit, onDuplicate, onDelete }: OrderCardProps) {
  const isInFlight = DELAYABLE_STATUSES.includes(order.status);
  const countdownColor = useCountdownColor(order.deliveryDate, order.deliveryTime);

  return (
    <Card
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden p-4 pl-5 before:absolute before:inset-y-0 before:left-0 before:w-1",
        "transition-shadow hover:shadow-lg hover:shadow-black/20",
        isInFlight ? ACCENT_BORDER[countdownColor] : "before:bg-border"
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onOpen(order)}
          className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/40"
        >
          {order.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={order.thumbnailUrl} alt={order.product} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-6" />
            </div>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onOpen(order)}
              className="truncate font-mono text-sm font-bold text-foreground hover:text-secondary"
            >
              {order.orderNumber}
            </button>
            <div className="flex items-center gap-1">
              {order.priority === "urgent" && <Badge variant="destructive">Urgent</Badge>}
              <OrderActionsMenu order={order} onOpen={onOpen} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
            </div>
          </div>
          <div className="truncate text-sm font-semibold text-foreground">{order.customerName}</div>
          <div className="truncate text-xs text-muted-foreground">{order.product}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <div className="truncate">
          <span className="text-muted-foreground/70">Paper:</span> {order.paper || "—"}
        </div>
        <div className="truncate">
          <span className="text-muted-foreground/70">Size:</span> {order.paperSize || "—"}
        </div>
        <div className="truncate">
          <span className="text-muted-foreground/70">Qty:</span> {order.quantity}
        </div>
        <div className="truncate">
          <span className="text-muted-foreground/70">Due:</span>{" "}
          {format(parseISO(order.deliveryDate), "MMM d")} · {order.deliveryTime.slice(0, 5)}
        </div>
      </div>

      <EmployeeChips employees={order.assignedEmployees} />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <OrderStatusBadge status={order.status} />
        {isInFlight && <CountdownTimer deliveryDate={order.deliveryDate} deliveryTime={order.deliveryTime} />}
        {order.pendingMaterialRequests > 0 && (
          <Badge variant="warning" className="gap-1">
            <PackageSearch className="size-3" />
            {order.pendingMaterialRequests} material request{order.pendingMaterialRequests > 1 ? "s" : ""}
          </Badge>
        )}
      </div>
    </Card>
  );
}

function OrderActionsMenu({
  order,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
}: OrderCardProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onOpen(order)}>
          <Eye className="size-4" /> Open
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(order)}>
          <Pencil className="size-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDuplicate(order)}>
          <Copy className="size-4" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => onDelete(order)}>
          <Trash2 className="size-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
