"use client";

import { memo } from "react";
import Image from "next/image";
import { ImageIcon, MoreVertical, Copy, Pencil, Trash2, Eye } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CountdownTimer } from "@/components/orders/countdown-timer";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { EmployeeChips } from "@/components/orders/employee-chips";
import { formatDeliveryTime } from "@/lib/utils/countdown";
import { MATERIAL_TYPE_LABELS } from "@/types/domain";
import { DELAYABLE_STATUSES } from "@/types/domain";
import type { OrderListItem } from "@/lib/actions/orders";

interface OrderListViewProps {
  orders: OrderListItem[];
  onOpen: (order: OrderListItem) => void;
  onEdit: (order: OrderListItem) => void;
  onDuplicate: (order: OrderListItem) => void;
  onDelete: (order: OrderListItem) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export const OrderListView = memo(function OrderListView({
  orders,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
  selectedIds,
  onToggleSelect,
}: OrderListViewProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {onToggleSelect && <TableHead className="w-8" />}
          <TableHead>Order</TableHead>
          <TableHead>Customer / Product</TableHead>
          <TableHead>Assigned</TableHead>
          <TableHead>Delivery</TableHead>
          <TableHead>Countdown</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Materials</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const isInFlight = DELAYABLE_STATUSES.includes(order.status);
          return (
            <TableRow key={order.id} className="cursor-pointer" onClick={() => onOpen(order)}>
              {onToggleSelect && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selectedIds?.has(order.id) ?? false} onCheckedChange={() => onToggleSelect(order.id)} />
                </TableCell>
              )}
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <div className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
                    {order.thumbnailUrl ? (
                      <Image src={order.thumbnailUrl} alt="" fill sizes="36px" className="object-cover" />
                    ) : (
                      <ImageIcon className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <div className="font-mono text-xs font-bold">{order.orderNumber}</div>
                    {order.priority === "urgent" && (
                      <Badge variant="destructive" className="mt-0.5">
                        Urgent
                      </Badge>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="max-w-[220px]">
                  <div className="truncate font-medium text-foreground">{order.customerName}</div>
                  <div className="truncate text-xs text-muted-foreground">{order.product}</div>
                </div>
              </TableCell>
              <TableCell>
                <EmployeeChips employees={order.assignedEmployees} max={2} />
              </TableCell>
              <TableCell className="whitespace-nowrap font-semibold">
                {format(parseISO(order.deliveryDate), "MMM d")} · {formatDeliveryTime(order.deliveryTime)}
              </TableCell>
              <TableCell>{isInFlight && <CountdownTimer deliveryDate={order.deliveryDate} deliveryTime={order.deliveryTime} />}</TableCell>
              <TableCell>
                <OrderStatusBadge status={order.status} />
              </TableCell>
              <TableCell>
                {order.pendingMaterialTypes.length > 0 && (
                  <Badge variant="warning">
                    {order.pendingMaterialTypes.length > 1
                      ? `${order.pendingMaterialTypes.length} Pending`
                      : `Waiting for ${MATERIAL_TYPE_LABELS[order.pendingMaterialTypes[0]]}`}
                  </Badge>
                )}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
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
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
});
