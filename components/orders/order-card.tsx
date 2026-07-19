"use client";

import { memo } from "react";
import Image from "next/image";
import { ImageIcon, MoreVertical, Copy, Pencil, Trash2, Eye, CalendarClock, Store, Truck } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CountdownTimer, useCountdownColor } from "@/components/orders/countdown-timer";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { EmployeeChips } from "@/components/orders/employee-chips";
import { MaterialRequestBadge } from "@/components/orders/material-request-badge";
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
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export const OrderCard = memo(function OrderCard({
  order,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
  selected,
  onToggleSelect,
}: OrderCardProps) {
  const isInFlight = DELAYABLE_STATUSES.includes(order.status);
  const countdownColor = useCountdownColor(order.deliveryDate, order.deliveryTime);

  return (
    <Card
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden p-4 pl-5 before:absolute before:inset-y-0 before:left-0 before:w-1",
        "transition-shadow hover:shadow-lg hover:shadow-black/10",
        isInFlight ? ACCENT_BORDER[countdownColor] : "before:bg-border",
        selected && "ring-2 ring-secondary"
      )}
    >
      {onToggleSelect && (
        <div className="absolute top-3 right-3 z-10">
          <Checkbox checked={selected ?? false} onCheckedChange={() => onToggleSelect(order.id)} />
        </div>
      )}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onOpen(order)}
          className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/40"
        >
          {order.thumbnailUrl ? (
            <Image src={order.thumbnailUrl} alt={order.product} fill sizes="64px" className="object-cover" />
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
          <div className="truncate text-xs text-muted-foreground">
            {order.product}
            {order.itemCount > 0 && ` +${order.itemCount} more item${order.itemCount > 1 ? "s" : ""}`}
          </div>
        </div>
      </div>

      {/* Delivery date/time + countdown — the most operationally important
          fact on the card, so it gets top billing over spec details. */}
      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-foreground">
          <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-bold">
            {format(parseISO(order.deliveryDate), "EEE, MMM d")} · {order.deliveryTime.slice(0, 5)}
          </span>
        </div>
        {isInFlight && (
          <CountdownTimer deliveryDate={order.deliveryDate} deliveryTime={order.deliveryTime} size="lg" />
        )}
      </div>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <div className="truncate">
          <span className="text-muted-foreground/70">Paper:</span> {order.paper || "—"}
        </div>
        <div className="flex gap-4">
          <span className="truncate">
            <span className="text-muted-foreground/70">Size:</span> {order.paperSize || "—"}
          </span>
          <span className="truncate">
            <span className="text-muted-foreground/70">Qty:</span> {order.quantity}
          </span>
        </div>
      </div>

      <EmployeeChips employees={order.assignedEmployees} />

      <MaterialRequestBadge types={order.pendingMaterialTypes} />

      <div className="flex flex-wrap items-center gap-2">
        <OrderStatusBadge status={order.status} />
        <Badge variant="outline" className="gap-1">
          {order.fulfillmentType === "delivery" ? (
            <Truck className="size-3" />
          ) : (
            <Store className="size-3" />
          )}
          {order.fulfillmentType === "delivery" ? "Delivery" : "Pickup"}
        </Badge>
      </div>
    </Card>
  );
});

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
          aria-label={`Actions for order ${order.orderNumber}`}
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
