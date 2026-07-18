"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryState, parseAsInteger } from "nuqs";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, PackageOpen } from "lucide-react";

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
  type OrderListResult,
} from "@/lib/actions/orders";
import { DEFAULT_ORDERS_PAGE_SIZE } from "@/lib/orders/constants";
import type { EmployeeListItem } from "@/lib/actions/employees";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { CHANNELS } from "@/lib/realtime/constants";
import { StatsGrid } from "@/components/manager/stats-grid";
import { QuickActions } from "@/components/manager/quick-actions";
import { OrderFilters as OrderFiltersBar } from "@/components/manager/order-filters";
import { ViewToggle, type OrderView } from "@/components/manager/view-toggle";
import { OrderCard } from "@/components/orders/order-card";
import { OrderListView } from "@/components/orders/order-list-view";
import { BulkActionsBar } from "@/components/manager/bulk-actions-bar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Both dialogs carry real weight (RHF + Zod + file upload UI) and stay
// hidden until the user opens them — no reason to ship that JS on first paint.
const OrderForm = dynamic(() => import("@/components/orders/order-form").then((m) => m.OrderForm), { ssr: false });
const OrderDetailDrawer = dynamic(
  () => import("@/components/orders/order-detail-drawer").then((m) => m.OrderDetailDrawer),
  { ssr: false }
);

interface DashboardClientProps {
  initialStats: DashboardStats;
  initialOrdersResult: OrderListResult;
  employees: EmployeeListItem[];
}

export function DashboardClient({ initialStats, initialOrdersResult, employees }: DashboardClientProps) {
  const queryClient = useQueryClient();

  const [search] = useQueryState("q", { defaultValue: "" });
  const [status] = useQueryState("status", { defaultValue: "all" });
  const [employeeId] = useQueryState("employee", { defaultValue: "all" });
  const [priority] = useQueryState("priority", { defaultValue: "all" });
  const [deliveryDate] = useQueryState("date", { defaultValue: "" });
  const [viewParam, setViewParam] = useQueryState("view", { defaultValue: "card" });
  const view: OrderView = viewParam === "list" ? "list" : "card";
  const setView = (next: OrderView) => setViewParam(next === "card" ? null : next);
  const [orderParam, setOrderParam] = useQueryState("order");
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  const filters: OrderFilters = {
    search,
    status: status as OrderFilters["status"],
    employeeId,
    priority: priority as OrderFilters["priority"],
    deliveryDate,
    page,
    pageSize: DEFAULT_ORDERS_PAGE_SIZE,
  };
  const isDefaultFilters =
    !search && status === "all" && employeeId === "all" && priority === "all" && !deliveryDate;

  // Any real filter change invalidates the current page — otherwise
  // "page 3" of a brand-new, narrower filter could just be empty even
  // though matching orders exist on page 1.
  const filterSignature = `${search}|${status}|${employeeId}|${priority}|${deliveryDate}`;
  const previousSignature = useRef(filterSignature);
  useEffect(() => {
    if (previousSignature.current !== filterSignature) {
      previousSignature.current = filterSignature;
      if (page !== 1) setPage(1);
    }
  }, [filterSignature, page, setPage]);

  const ordersQuery = useQuery({
    queryKey: ["orders", filters],
    queryFn: () => getOrders(filters),
    initialData: isDefaultFilters && page === 1 ? initialOrdersResult : undefined,
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Deep link from Global Search (?order=ID) — open the drawer once, then
  // drop the param so it doesn't reopen on back/forward navigation.
  useEffect(() => {
    if (orderParam) {
      setDetailOrderId(orderParam);
      setDetailOpen(true);
      setOrderParam(null);
    }
  }, [orderParam, setOrderParam]);

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const handleOpen = useCallback((order: OrderListItem) => {
    setDetailOrderId(order.id);
    setDetailOpen(true);
  }, []);

  const handleNewOrder = () => {
    setEditingOrder(null);
    setFormOpen(true);
  };

  const handleEditFromCard = useCallback(async (order: OrderListItem) => {
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

  const handleDuplicate = useCallback((order: OrderListItem) => {
    setDuplicatingId(order.id);
    duplicateOrder(order.id)
      .then(() => {
        toast.success(`${order.orderNumber} duplicated — check the delivery date & time`);
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["stats"] });
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to duplicate order"))
      .finally(() => setDuplicatingId(null));
  }, [queryClient]);

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

  const ordersResult =
    ordersQuery.data ?? { items: [] as OrderListItem[], totalCount: 0, page, pageSize: DEFAULT_ORDERS_PAGE_SIZE };
  const orders = ordersResult.items;
  const totalPages = Math.max(1, Math.ceil(ordersResult.totalCount / ordersResult.pageSize));

  return (
    <div className="flex flex-col gap-6">
      <StatsGrid stats={statsQuery.data} isLoading={statsQuery.isFetching && !statsQuery.data} />
      <QuickActions onNewOrder={handleNewOrder} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1">
          <OrderFiltersBar employees={employees} />
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      <BulkActionsBar
        selectedIds={[...selectedIds]}
        employees={employees}
        onClear={() => setSelectedIds(new Set())}
        onDone={() => {
          setSelectedIds(new Set());
          refreshLists();
        }}
      />

      {ordersQuery.isLoading ? (
        <SkeletonGrid />
      ) : orders.length === 0 ? (
        <EmptyState hasFilters={!isDefaultFilters} onNewOrder={handleNewOrder} />
      ) : view === "list" ? (
        <OrderListView
          orders={orders}
          onOpen={handleOpen}
          onEdit={handleEditFromCard}
          onDuplicate={handleDuplicate}
          onDelete={setDeleteTarget}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
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
              selected={selectedIds.has(order.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {orders.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {(page - 1) * ordersResult.pageSize + 1}–{(page - 1) * ordersResult.pageSize + orders.length} of{" "}
            {ordersResult.totalCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
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
