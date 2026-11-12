"use client";

import type { ComponentType } from "react";
import { CheckCircle2, Clock, PackageCheck, PackageSearch, Sparkles, Truck } from "lucide-react";

import { OrderCard } from "@/components/orders/order-card";
import type { DashboardBoardResult, OrderListItem } from "@/lib/actions/orders";
import type { OrderDeliveryProvider, OrderStatus } from "@/types/database.types";

interface DashboardBoardProps {
  board: DashboardBoardResult;
  onOpen: (order: OrderListItem) => void;
  onEdit: (order: OrderListItem) => void;
  onDuplicate: (order: OrderListItem) => void;
  onDelete: (order: OrderListItem) => void;
  onQuickStatusChange: (order: OrderListItem, status: OrderStatus, deliveryProvider?: OrderDeliveryProvider) => void;
  quickActionPendingId: string | null;
  onAssign: (order: OrderListItem) => void;
  onApprove: (order: OrderListItem) => void;
  onMarkDesignApproved: (order: OrderListItem) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

interface SectionDef {
  key: keyof DashboardBoardResult;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Header band tint and the solid icon chip — each stage reads as its own colour at a glance. */
  band: string;
  chip: string;
}

// Same hues as each stage's status chip; delivery takes violet (as on the
// TV board) so the two "Ready" stages don't look alike.
const SECTIONS: SectionDef[] = [
  { key: "new", label: "New Orders", icon: Sparkles, band: "bg-secondary/10", chip: "bg-secondary text-white" },
  { key: "inProgress", label: "In Progress", icon: Clock, band: "bg-warning/15", chip: "bg-warning text-warning-foreground" },
  { key: "waitingMaterials", label: "Waiting for Materials", icon: PackageSearch, band: "bg-destructive/10", chip: "bg-destructive text-white" },
  { key: "readyPickup", label: "Ready for Pickup", icon: PackageCheck, band: "bg-success/15", chip: "bg-success text-white" },
  { key: "readyDelivery", label: "Ready for Delivery", icon: Truck, band: "bg-violet-500/10", chip: "bg-violet-600 text-white" },
  { key: "deliveredToday", label: "Delivered Today", icon: CheckCircle2, band: "bg-muted", chip: "bg-muted-foreground text-white" },
];

export function DashboardBoard({
  board,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
  onQuickStatusChange,
  quickActionPendingId,
  onAssign,
  onApprove,
  onMarkDesignApproved,
  selectedIds,
  onToggleSelect,
}: DashboardBoardProps) {
  return (
    <div className="flex flex-col gap-8">
      {SECTIONS.map((section) => {
        const orders = board[section.key];
        const Icon = section.icon;
        return (
          <section key={section.key} id={`board-${section.key}`} className="flex scroll-mt-20 flex-col gap-3">
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-3 py-2.5 ${section.band}`}>
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${section.chip}`}>
                <Icon className="size-5" />
              </span>
              <h2 className="text-lg font-extrabold tracking-tight text-foreground">{section.label}</h2>
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-card px-2 text-sm font-bold text-foreground tabular-nums shadow-sm">
                {orders.length}
              </span>
              {section.key === "deliveredToday" && orders.length > 0 && (
                <span className="text-sm text-muted-foreground">clears at midnight</span>
              )}
              {/* An empty stage is a one-line fact, not a card-sized hole in the board. */}
              {orders.length === 0 && <span className="text-sm text-muted-foreground">None right now</span>}
            </div>

            {orders.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onOpen={onOpen}
                    onEdit={onEdit}
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                    selected={selectedIds.has(order.id)}
                    onToggleSelect={onToggleSelect}
                    onQuickStatusChange={onQuickStatusChange}
                    quickActionPending={quickActionPendingId === order.id}
                    onAssign={onAssign}
                    onApprove={onApprove}
                    onMarkDesignApproved={onMarkDesignApproved}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
