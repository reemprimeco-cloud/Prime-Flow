"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { PackageOpen } from "lucide-react";

import {
  deleteOrder,
  duplicateOrder,
  getDashboardStats,
  getOrderDetail,
  getOrders,
  type DashboardStats,
  type OrderDetail,
  type OrderFilters,
  type OrderListItem,
} from "@/lib/actions/orders";
import type { EmployeeListItem } from "@/lib/actions/employees";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { CHANNELS } from "@/lib/realtime/constants";
import { StatsGrid } from "@/components/manager/stats-grid";
import { QuickActions } from "@/components/manager/quick-actions";
import { OrderFilters as OrderFiltersBar } from "@/components/manager/order-filters";
import { OrderCard } from "@/components/orders/order-card";
import { OrderForm } from "@/components/orders/order-form";
import { OrderDetailDrawer } from "@/components/orders/order-detail-drawer";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card } from "@/components/ui/card";

interface DashboardClientProps {
  initialStats: DashboardStats;
  initialOrders: OrderListItem[];
  employees: EmployeeListItem[];
}

export function DashboardClient({ initialStats, initialOrders, employees }: DashboardClientProps) {
  const queryClient = useQueryClient();

  const [search] = useQueryState("q", { defaultValue: "" });
  const [status] = useQueryState("status", { defaultValue: "all" });
  const [employeeId] = useQueryState("employee", { defaultValue: "all" });
  const [priority] = useQueryState("priority", { defaultValue: "all" });
  const [deliveryDate] = useQueryState("date", { defaultValue: "" });

  const filters: OrderFilters = {
    search,
    status: status as OrderFilters["status"],
    employeeId,
    priority: priority as OrderFilters["priority"],
    deliveryDate,
  };
  const isDefaultFilters =
    !search && status === "all" && employeeId === "all" && priority === "all" && !deliveryDate;

  const ordersQuery = useQuery({
    queryKey: ["orders", filters],
    queryFn: () => getOrders(filters),
    initialData: isDefaultFilters ? initialOrders : undefined,
  });

  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: () => getDashboardStats(),
    initialData: initialStats,
  });

  useRealtimeChannel(CHANNELS.production, () => {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
    queryClient.invalidateQueries({ queryKey: ["order"] });
  });
  useRealtimeChannel(CHANNELS.materialRequests, () => {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["order"] });
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderDetail | null>(null);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrderListItem | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const handleOpen = (order: OrderListItem) => {
    setDetailOrderId(order.id);
    setDetailOpen(true);
  };

  const handleNewOrder = () => {
    setEditingOrder(null);
    setFormOpen(true);
  };

  const handleEditFromCard = async (order: OrderListItem) => {
    try {
      const detail = await getOrderDetail(order.id);
      setEditingOrder(detail);
      setFormOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load order");
    }
  };

  const handleEditFromDrawer = async () => {
    if (!detailOrderId) return;
    try {
      const detail = await getOrderDetail(detailOrderId);
      setDetailOpen(false);
      setEditingOrder(detail);
      setFormOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load order");
    }
  };

  const handleDuplicate = (order: OrderListItem) => {
    setDuplicatingId(order.id);
    duplicateOrder(order.id)
      .then(() => {
        toast.success(`${order.orderNumber} duplicated — check the delivery date & time`);
        refreshLists();
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to duplicate order"))
      .finally(() => setDuplicatingId(null));
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startDeleteTransition(async () => {
      try {
        await deleteOrder(target.id);
        toast.success(`${target.orderNumber} deleted`);
        setDeleteTarget(null);
        refreshLists();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete order");
      }
    });
  };

  const orders = ordersQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <StatsGrid stats={statsQuery.data} isLoading={statsQuery.isFetching && !statsQuery.data} />
      <QuickActions onNewOrder={handleNewOrder} />
      <OrderFiltersBar employees={employees} />

      {ordersQuery.isLoading ? (
        <SkeletonGrid />
      ) : orders.length === 0 ? (
        <EmptyState hasFilters={!isDefaultFilters} onNewOrder={handleNewOrder} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onOpen={handleOpen}
              onEdit={handleEditFromCard}
              onDuplicate={handleDuplicate}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <OrderForm
        open={formOpen}
        onOpenChange={setFormOpen}
        order={editingOrder}
        employees={employees}
        onSaved={refreshLists}
      />

      <OrderDetailDrawer
        orderId={detailOrderId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEditFromDrawer}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this order?"
        description={
          deleteTarget
            ? `This permanently deletes ${deleteTarget.orderNumber} and its uploaded files. This can't be undone.`
            : ""
        }
        confirmLabel="Delete Order"
        pending={isDeleting}
        onConfirm={confirmDelete}
      />

      {duplicatingId && (
        <span className="sr-only" role="status">
          Duplicating order…
        </span>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} className="h-[172px] animate-pulse bg-card/60" />
      ))}
    </div>
  );
}

function EmptyState({ hasFilters, onNewOrder }: { hasFilters: boolean; onNewOrder: () => void }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <PackageOpen className="size-6" />
      </div>
      <div>
        <p className="font-semibold text-foreground">
          {hasFilters ? "No orders match your filters" : "No orders yet"}
        </p>
        <p className="text-sm text-muted-foreground">
          {hasFilters ? "Try clearing a filter or search term." : "Create the first production order to get started."}
        </p>
      </div>
      {!hasFilters && (
        <button
          type="button"
          onClick={onNewOrder}
          className="mt-1 text-sm font-semibold text-secondary hover:underline"
        >
          + New Order
        </button>
      )}
    </Card>
  );
}
