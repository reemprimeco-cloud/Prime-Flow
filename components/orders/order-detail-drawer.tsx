"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { FileText, ImageIcon, Loader2, MessageSquareText, Pencil, ShieldAlert } from "lucide-react";

import { getOrderDetail } from "@/lib/actions/orders";
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
import { CountdownTimer } from "@/components/orders/countdown-timer";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { OverrideStatusDialog } from "@/components/orders/override-status-dialog";
import {
  DELAYABLE_STATUSES,
  MATERIAL_REQUEST_STATUS_LABELS,
  MATERIAL_TYPE_LABELS,
} from "@/types/domain";

interface OrderDetailDrawerProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}

export function OrderDetailDrawer({ orderId, open, onOpenChange, onEdit }: OrderDetailDrawerProps) {
  const queryClient = useQueryClient();
  const [overrideOpen, setOverrideOpen] = useState(false);
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
              </section>

              <DetailSection title="Customer">
                <DetailRow label="Name" value={order.customerName} />
                <DetailRow label="Mobile" value={order.customerMobile} />
              </DetailSection>

              <DetailSection title="Specifications">
                <DetailRow label="Product" value={order.product} />
                <DetailRow label="Paper" value={order.paper || "—"} />
                <DetailRow label="Size" value={order.paperSize || "—"} />
                <DetailRow label="Quantity" value={String(order.quantity)} />
                <DetailRow label="Finishing" value={order.finishing || "—"} />
                <DetailRow
                  label="Delivery"
                  value={`${format(parseISO(order.deliveryDate), "EEE, MMM d")} · ${order.deliveryTime.slice(0, 5)}`}
                />
              </DetailSection>

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
