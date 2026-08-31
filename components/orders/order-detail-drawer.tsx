"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { ExternalLink, FileText, ImageIcon, Loader2, MapPin, MessageSquareText, Pencil, ShieldAlert, Truck } from "lucide-react";
import { toast } from "sonner";

import { getOrderDetail, updateOrderStatus } from "@/lib/actions/orders";
import { cancelArmadaDeliveryAction, retryArmadaDispatch } from "@/lib/actions/armada";
import { buildGoogleMapsLink } from "@/lib/utils/maps";
import { formatDeliveryTime } from "@/lib/utils/countdown";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { CHANNELS } from "@/lib/realtime/constants";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { StatusActions } from "@/components/orders/status-actions";
import { CountdownTimer } from "@/components/orders/countdown-timer";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { OverrideStatusDialog } from "@/components/orders/override-status-dialog";
import {
  DELAYABLE_STATUSES,
  MATERIAL_REQUEST_STATUS_LABELS,
  MATERIAL_TYPE_LABELS,
  ORDER_DELIVERY_PROVIDER_LABELS,
  ORDER_STATUS_LABELS,
} from "@/types/domain";
import type { OrderDeliveryProvider, OrderStatus } from "@/types/database.types";

interface OrderDetailDrawerProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}

export function OrderDetailDrawer({ orderId, open, onOpenChange, onEdit }: OrderDetailDrawerProps) {
  const queryClient = useQueryClient();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [armadaActionPending, startArmadaAction] = useTransition();
  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrderDetail(orderId as string),
    enabled: open && !!orderId,
  });

  // Keeps an already-open drawer live if another user (or dashboard) changes
  // this order elsewhere — otherwise it'd show stale status/material data
  // until closed and reopened.
  useRealtimeChannel(CHANNELS.production, () => {
    if (orderId) {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-timeline", orderId] });
    }
  });
  useRealtimeChannel(CHANNELS.materialRequests, () => {
    if (orderId) queryClient.invalidateQueries({ queryKey: ["order", orderId] });
  });

  const handleStatusChange = (status: OrderStatus, deliveryProvider?: OrderDeliveryProvider) => {
    if (!order) return;
    setStatusPending(true);
    updateOrderStatus(order.id, status, deliveryProvider)
      .then(() => {
        toast.success(`${order.orderNumber} → ${ORDER_STATUS_LABELS[status]}`);
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["stats"] });
        queryClient.invalidateQueries({ queryKey: ["order-timeline", orderId] });
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to update status"))
      .finally(() => setStatusPending(false));
  };

  const refreshOrder = () => {
    queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["order-timeline", orderId] });
  };

  const handleRetryArmadaDispatch = () => {
    if (!order) return;
    startArmadaAction(async () => {
      try {
        await retryArmadaDispatch(order.id);
        toast.success("Dispatched to Armada");
        refreshOrder();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to dispatch to Armada");
      }
    });
  };

  const handleCancelArmadaDelivery = () => {
    if (!order) return;
    startArmadaAction(async () => {
      try {
        await cancelArmadaDeliveryAction(order.id);
        toast.success("Armada delivery canceled");
        refreshOrder();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to cancel Armada delivery");
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle>{order ? order.orderNumber : "Order"}</SheetTitle>
            {order && <OrderStatusBadge status={order.status} />}
          </div>
          <SheetDescription>{order?.customerName ?? "Loading order details…"}</SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-6">
          {isLoading && (
            <div className="flex flex-1 items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}

          {order && (
            <>
              <section className="flex flex-wrap items-center gap-2">
                {DELAYABLE_STATUSES.includes(order.status) && (
                  <CountdownTimer deliveryDate={order.deliveryDate} deliveryTime={order.deliveryTime} />
                )}
                {order.priority === "urgent" && <Badge variant="destructive">Urgent</Badge>}
                <Badge variant="outline">{order.fulfillmentType === "delivery" ? "Delivery" : "Pickup"}</Badge>
                <Badge variant="muted">{order.preferredLanguage === "ar" ? "Arabic" : "English"}</Badge>
                <Badge variant="muted">WhatsApp {order.whatsappEnabled ? "on" : "off"}</Badge>
                {order.status === "new" && !order.approved && (
                  <Badge variant="warning" className="gap-1">
                    <ShieldAlert className="size-3" />
                    Pending Approval
                  </Badge>
                )}
              </section>

              <StatusActions
                status={order.status}
                fulfillmentType={order.fulfillmentType}
                isOutsourced={false}
                pending={statusPending}
                onChange={handleStatusChange}
              />

              <DetailSection title="Customer">
                <DetailRow label="Name" value={order.customerName} />
                <DetailRow label="Mobile" value={order.customerMobile} />
              </DetailSection>

              <DetailSection title="Specifications">
                <DetailRow label="Product" value={order.product} />
                <DetailRow label="Quantity" value={String(order.quantity)} />
                {/* Paper/Size only exist on orders predating the form's
                    single "Order details" box — shown when there's something
                    to show rather than as empty rows. */}
                {order.paper && <DetailRow label="Paper" value={order.paper} />}
                {order.paperSize && <DetailRow label="Size" value={order.paperSize} />}
                {order.finishing && <DetailRow label="Order Details" value={order.finishing} />}
                <DetailRow
                  label="Delivery"
                  value={`${format(parseISO(order.deliveryDate), "EEE, MMM d")} · ${formatDeliveryTime(order.deliveryTime)}`}
                />
                {order.fulfillmentType === "delivery" && order.deliveryAddress && (
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">Address</span>
                    <a
                      href={order.deliveryMapLink || buildGoogleMapsLink(order.deliveryAddress)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-right font-medium text-secondary hover:underline"
                    >
                      {order.deliveryAddress}
                      <MapPin className="size-3.5 shrink-0" />
                    </a>
                  </div>
                )}
                {order.fulfillmentType === "delivery" && !order.deliveryAddress && order.deliveryMapLink && (
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">Map Location</span>
                    <a
                      href={order.deliveryMapLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-right font-medium text-secondary hover:underline"
                    >
                      Open in Maps
                      <MapPin className="size-3.5 shrink-0" />
                    </a>
                  </div>
                )}
              </DetailSection>

              {order.fulfillmentType === "delivery" && (
                <DetailSection title="Delivery Provider">
                  <DetailRow label="Provider" value={ORDER_DELIVERY_PROVIDER_LABELS[order.deliveryProvider]} />
                  {order.deliveryProvider === "armada" && (
                    <>
                      {order.armadaDeliveryStatus && (
                        <DetailRow label="Armada Status" value={order.armadaDeliveryStatus} />
                      )}
                      {order.armadaDriverName && <DetailRow label="Driver" value={order.armadaDriverName} />}
                      {order.armadaDriverPhone && <DetailRow label="Driver Phone" value={order.armadaDriverPhone} />}
                      {order.armadaTrackingLink && (
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="text-muted-foreground">Tracking</span>
                          <a
                            href={order.armadaTrackingLink}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-right font-medium text-secondary hover:underline"
                          >
                            Open tracking link
                            <ExternalLink className="size-3.5 shrink-0" />
                          </a>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {!order.armadaDeliveryCode && order.status === "ready_delivery" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={armadaActionPending}
                            onClick={handleRetryArmadaDispatch}
                            className="gap-2"
                          >
                            {armadaActionPending ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />}
                            Dispatch to Armada
                          </Button>
                        )}
                        {order.armadaDeliveryCode && order.status !== "delivered" && order.armadaDeliveryStatus !== "canceled" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={armadaActionPending}
                            onClick={handleCancelArmadaDelivery}
                            className="gap-2"
                          >
                            {armadaActionPending && <Loader2 className="size-3.5 animate-spin" />}
                            Cancel Armada Delivery
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </DetailSection>
              )}

              {order.items.map((item, index) => (
                <DetailSection key={item.id} title={`Item ${index + 2}: ${item.product}`}>
                  <DetailRow label="Quantity" value={String(item.quantity)} />
                  {item.paper && <DetailRow label="Paper" value={item.paper} />}
                  {item.paperSize && <DetailRow label="Size" value={item.paperSize} />}
                  {item.finishing && <DetailRow label="Order Details" value={item.finishing} />}
                  <DetailRow label="Assigned To" value={item.employeeName || "Unassigned"} />
                </DetailSection>
              ))}

              {order.notes && (
                <DetailSection title="Production Notes">
                  <p className="text-sm text-foreground">{order.notes}</p>
                </DetailSection>
              )}

              <DetailSection title="Assigned Employees">
                {order.assignedEmployees.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No one assigned yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {order.assignedEmployees.map((e) => (
                      <span key={e.id} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                        {e.fullName}
                      </span>
                    ))}
                  </div>
                )}
              </DetailSection>

              <DetailSection title="Product Images">
                {order.productImages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No images uploaded.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {order.productImages.map((file) => (
                      <a
                        key={file.id}
                        href={file.url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted/40"
                      >
                        {file.url ? (
                          <Image src={file.url} alt={file.fileName} fill sizes="120px" className="object-cover" />
                        ) : (
                          <div className="flex size-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="size-5" />
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </DetailSection>

              <DetailSection title="Design Files">
                {order.designFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No design files uploaded.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {order.designFiles.map((file) => (
                      <li key={file.id}>
                        <a
                          href={file.url ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm hover:border-secondary"
                        >
                          <FileText className="size-4 text-muted-foreground" />
                          <span className="truncate">{file.fileName}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailSection>

              <DetailSection title="Material Requests">
                {order.materialRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No material requests for this order.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {order.materialRequests.map((request) => (
                      <li
                        key={request.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            {MATERIAL_TYPE_LABELS[request.materialType]} · {request.quantity}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {request.description} — {request.employeeName}
                          </div>
                        </div>
                        <Badge variant={request.status === "pending" ? "warning" : "muted"}>
                          {MATERIAL_REQUEST_STATUS_LABELS[request.status]}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailSection>

              <DetailSection title="Notes Timeline">
                {order.orderNotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No floor notes yet.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {order.orderNotes.map((note) => (
                      <li key={note.id} className="flex gap-2.5">
                        <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-foreground">{note.note}</p>
                          <p className="text-xs text-muted-foreground">
                            {note.employeeName} · {format(new Date(note.createdAt), "MMM d, h:mm a")}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailSection>

              <DetailSection title="Production Timeline">
                <OrderTimeline orderId={order.id} />
              </DetailSection>
            </>
          )}
        </SheetBody>

        {order && (
          <SheetFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(true)} className="gap-2">
              <ShieldAlert className="size-4" />
              Override Status
            </Button>
            <Button variant="primary" onClick={onEdit} className="gap-2">
              <Pencil className="size-4" />
              Edit Order
            </Button>
          </SheetFooter>
        )}

        {order && (
          <OverrideStatusDialog
            open={overrideOpen}
            onOpenChange={setOverrideOpen}
            orderId={order.id}
            orderNumber={order.orderNumber}
            currentStatus={order.status}
            onOverridden={() => {
              queryClient.invalidateQueries({ queryKey: ["order", orderId] });
              queryClient.invalidateQueries({ queryKey: ["orders"] });
              queryClient.invalidateQueries({ queryKey: ["stats"] });
              queryClient.invalidateQueries({ queryKey: ["order-timeline", orderId] });
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Separator />
      <section className="flex flex-col gap-2.5">
        <h3 className="text-sm font-bold text-muted-foreground">{title}</h3>
        {children}
      </section>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
