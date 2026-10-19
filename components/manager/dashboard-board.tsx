"use client";

import type { ComponentType } from "react";
import { CheckCircle2, Clock, PackageCheck, PackageSearch, Sparkles, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

interface SectionDef {
  key: keyof DashboardBoardResult;
  label: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
}

const SECTIONS: SectionDef[] = [
  { key: "new", label: "New Orders", icon: Sparkles, accent: "text-secondary" },
  { key: "inProgress", label: "In Progress", icon: Clock, accent: "text-warning" },
  { key: "waitingMaterials", label: "Waiting for Materials", icon: PackageSearch, accent: "text-destructive" },
  { key: "readyPickup", label: "Ready for Pickup", icon: PackageCheck, accent: "text-success" },
  { key: "readyDelivery", label: "Ready for Delivery", icon: Truck, accent: "text-success" },
  { key: "deliveredToday", label: "Delivered Today", icon: CheckCircle2, accent: "text-muted-foreground" },
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
  selectedIds,
  onToggleSelect,
}: DashboardBoardProps) {
  return (
    <div className="flex flex-col gap-6">
      {SECTIONS.map((section) => {
        const orders = board[section.key];
        const Icon = section.icon;
        return (
          <section key={section.key} id={`board-${section.key}`} className="flex scroll-mt-20 flex-col gap-3">
            <div className="flex items-center gap-2">
              <Icon className={`size-4 ${section.accent}`} />
              <h2 className="text-sm font-bold text-foreground">{section.label}</h2>
              <Badge variant="muted">{orders.length}</Badge>
              {section.key === "deliveredToday" && orders.length > 0 && (
                <span className="text-xs text-muted-foreground">— clears at midnight</span>
              )}
              {/* An empty stage is a one-line fact, not a card-sized hole in the board. */}
              {orders.length === 0 && <span className="text-xs text-muted-foreground">None right now</span>}
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
