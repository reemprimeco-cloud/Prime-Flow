"use client";

import { memo } from "react";
import Image from "next/image";
import { ImageIcon, MoreVertical, Copy, Pencil, Trash2, Eye, CalendarClock, Store, Truck, ShieldAlert } from "lucide-react";
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
import { StatusActions } from "@/components/orders/status-actions";
import { formatDeliveryTime } from "@/lib/utils/countdown";
import { cn } from "@/lib/utils";
import { DELAYABLE_STATUSES } from "@/types/domain";
import type { OrderListItem } from "@/lib/actions/orders";
import type { OrderStatus } from "@/types/database.types";

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
  /**
   * Compact "mark done" quick action (Picked Up / Delivered) shown directly
   * on the card for ready_pickup/ready_delivery orders, so a manager doesn't
   * have to open the full detail drawer just to close out an order. Omit to
   * hide it entirely (e.g. read-only contexts).
   */
  onQuickStatusChange?: (order: OrderListItem, status: OrderStatus) => void;
  quickActionPending?: boolean;
}

export const OrderCard = memo(function OrderCard({
  order,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
  selected,
  onToggleSelect,
  onQuickStatusChange,
  quickActionPending,
}: OrderCardProps) {
  const isInFlight = DELAYABLE_STATUSES.includes(order.status);
  const countdownColor = useCountdownColor(order.deliveryDate, order.deliveryTime);

  return (
    <Card
      className={cn(
        "group relative flex flex-col gap-2.5 overflow-hidden p-3.5 pl-4 before:absolute before:inset-y-0 before:left-0 before:w-1",
        "transition-shadow hover:shadow-lg hover:shadow-black/10",
        // A brand-new order gets a flat blue stripe (matching its status
        // badge) rather than the countdown colour every other in-flight
        // status uses — nobody's working it yet, so time-remaining urgency
        // isn't the useful signal, and it keeps New visually distinct from
        // In Progress and Ready at a glance.
        order.status === "new"
          ? "before:bg-secondary"
          : isInFlight
            ? ACCENT_BORDER[countdownColor]
            : "before:bg-border",
        selected && "ring-2 ring-secondary"
      )}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={() => onOpen(order)}
          className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/40"
        >
          {order.thumbnailUrl ? (
            <Image src={order.thumbnailUrl} alt={order.product} fill sizes="48px" className="object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-5" />
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
            <div className="flex shrink-0 items-center gap-1.5">
              {order.priority === "urgent" && <Badge variant="destructive">Urgent</Badge>}
              {onToggleSelect && (
                <Checkbox checked={selected ?? false} onCheckedChange={() => onToggleSelect(order.id)} />
              )}
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
      <div className="flex items-center justify-between gap-2.5 rounded-xl bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-1.5 text-foreground">
          <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs font-bold">
            {format(parseISO(order.deliveryDate), "EEE, MMM d")} · {formatDeliveryTime(order.deliveryTime)}
          </span>
        </div>
        {isInFlight && (
          <CountdownTimer deliveryDate={order.deliveryDate} deliveryTime={order.deliveryTime} size="sm" />
        )}
      </div>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <div className="flex gap-4">
          <span className="truncate">
            <span className="text-muted-foreground/70">Qty:</span> {order.quantity}
          </span>
          {order.paperSize && (
            <span className="truncate">
              <span className="text-muted-foreground/70">Size:</span> {order.paperSize}
            </span>
          )}
        </div>
        {/* Paper only exists on orders predating the form's single "Order
            details" box; finishing now carries the whole spec, so it's the
            one worth showing at a glance. */}
        {order.paper && (
          <div className="truncate">
            <span className="text-muted-foreground/70">Paper:</span> {order.paper}
          </div>
        )}
        {order.finishing && <div className="line-clamp-2">{order.finishing}</div>}
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
        {order.status === "new" && !order.approved && (
          <Badge variant="warning" className="gap-1">
            <ShieldAlert className="size-3" />
            Pending Approval
          </Badge>
        )}
      </div>

      {onQuickStatusChange && (order.status === "ready_pickup" || order.status === "ready_delivery") && (
        <StatusActions
          status={order.status}
          fulfillmentType={order.fulfillmentType}
          isOutsourced={false}
          pending={!!quickActionPending}
          onChange={(status) => onQuickStatusChange(order, status)}
          only={["collected", "delivered"]}
          size="sm"
        />
      )}
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
