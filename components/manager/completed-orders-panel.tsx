"use client";

import { useCallback, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryState, parseAsInteger } from "nuqs";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, PackageCheck, Search } from "lucide-react";

import {
  deleteOrder,
  duplicateOrder,
  getCompletedOrders,
  getOrderDetail,
  type OrderDetail,
  type OrderListItem,
} from "@/lib/actions/orders";
import { DEFAULT_ORDERS_PAGE_SIZE } from "@/lib/orders/constants";
import type { EmployeeListItem } from "@/lib/actions/employees";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { CHANNELS } from "@/lib/realtime/constants";
import { OrderCard } from "@/components/orders/order-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Same pattern as components/manager/dashboard-client.tsx — kept lazy for
// the same reason (RHF + Zod + file upload UI, not needed until opened).
const OrderForm = dynamic(() => import("@/components/orders/order-form").then((m) => m.OrderForm), { ssr: false });
const OrderDetailDrawer = dynamic(
  () => import("@/components/orders/order-detail-drawer").then((m) => m.OrderDetailDrawer),
  { ssr: false }
);

export function CompletedOrdersPanel({ employees }: { employees: EmployeeListItem[] }) {
  const queryClient = useQueryClient();

  const [search, setSearch] = useQueryState("cq", { defaultValue: "", clearOnDefault: true });
  const [page, setPage] = useQueryState("cpage", parseAsInteger.withDefault(1));

  const filters = { search, page, pageSize: DEFAULT_ORDERS_PAGE_SIZE };

  const ordersQuery = useQuery({
    queryKey: ["completed-orders", filters],
    queryFn: () => getCompletedOrders(filters),
  });

  useRealtimeChannel(CHANNELS.production, () => {
    queryClient.invalidateQueries({ queryKey: ["completed-orders"] });
  });

  const [editingOrder, setEditingOrder] = useState<OrderDetail | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrderListItem | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["completed-orders"] });

  const handleOpen = useCallback((order: OrderListItem) => {
    setDetailOrderId(order.id);
    setDetailOpen(true);
  }, []);

  const handleEdit = useCallback(async (order: OrderListItem) => {
    try {
      const detail = await getOrderDetail(order.id);
      setEditingOrder(detail);
      setFormOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load order");
    }
  }, []);

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

  const handleDuplicate = useCallback(
    (order: OrderListItem) => {
      setDuplicatingId(order.id);
      duplicateOrder(order.id)
        .then(() => {
          toast.success(`${order.orderNumber} duplicated — check the delivery date & time`);
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          queryClient.invalidateQueries({ queryKey: ["stats"] });
          queryClient.invalidateQueries({ queryKey: ["completed-orders"] });
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to duplicate order"))
        .finally(() => setDuplicatingId(null));
    },
    [queryClient]
  );

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startDeleteTransition(async () => {
      try {
        await deleteOrder(target.id);
        toast.success(`${target.orderNumber} deleted`);
        setDeleteTarget(null);
        refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete order");
      }
    });
  };

  const result = ordersQuery.data ?? {
    items: [] as OrderListItem[],
    totalCount: 0,
    page,
    pageSize: DEFAULT_ORDERS_PAGE_SIZE,
  };
  const orders = result.items;
  const totalPages = Math.max(1, Math.ceil(result.totalCount / result.pageSize));

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value || null);
            setPage(1);
          }}
          placeholder="Search order #, customer, phone, product…"
          className="pl-10"
        />
      </div>

      {ordersQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-[172px] animate-pulse bg-card/60" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <PackageCheck className="size-6" />
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {search ? "No completed orders match your search" : "No completed orders yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              Collected, delivered, and completed orders land here once they&rsquo;re done.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onOpen={handleOpen}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {orders.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {(page - 1) * result.pageSize + 1}–{(page - 1) * result.pageSize + orders.length} of {result.totalCount}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="size-4" /> Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <OrderForm open={formOpen} onOpenChange={setFormOpen} order={editingOrder} employees={employees} onSaved={refresh} />

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
