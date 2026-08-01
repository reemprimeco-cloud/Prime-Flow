"use client";

import Image from "next/image";
import { ArrowRightCircle, Download, ImageIcon, ListChecks, MapPin, NotebookPen, PackagePlus, Phone } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountdownTimer, useCountdownColor } from "@/components/orders/countdown-timer";
import { MaterialRequestBadge } from "@/components/orders/material-request-badge";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { StatusActions } from "@/components/orders/status-actions";
import { cn } from "@/lib/utils";
import { buildGoogleMapsLink } from "@/lib/utils/maps";
import { formatDeliveryTime } from "@/lib/utils/countdown";
import type { EmployeeJobItem } from "@/lib/actions/employee-jobs";
import type { OrderStatus } from "@/types/database.types";

const ACCENT_BORDER = {
  green: "before:bg-success",
  yellow: "before:bg-warning",
  orange: "before:bg-warning",
  red: "before:bg-destructive",
} as const;

interface JobCardProps {
  job: EmployeeJobItem;
  isOutsourced: boolean;
  pending: boolean;
  onStatusChange: (status: OrderStatus) => void;
  onHandOff: () => void;
  onAddNote: () => void;
  onRequestMaterial: () => void;
  onOpenItems: () => void;
}

export function JobCard({
  job,
  isOutsourced,
  pending,
  onStatusChange,
  onHandOff,
  onAddNote,
  onRequestMaterial,
  onOpenItems,
}: JobCardProps) {
  const countdownColor = useCountdownColor(job.deliveryDate, job.deliveryTime);
  const heroImage = job.productImages[0];
  // A single-item order already shows everything on the card — the
  // checklist only earns its keep once there's more than one item to track.
  const hasMultipleItems = job.itemCount > 0;
  const readyItemCount = (job.itemReady ? 1 : 0) + job.additionalItems.filter((i) => i.isReady).length;
  const totalItemCount = job.itemCount + 1;

  return (
    <Card
      className={cn(
        "relative flex flex-col gap-3.5 overflow-hidden p-4 pl-5 before:absolute before:inset-y-0 before:left-0 before:w-1 sm:p-5 sm:pl-6",
        ACCENT_BORDER[countdownColor]
      )}
    >
      <div className="flex items-start gap-3">
        <a
          href={heroImage?.url ?? undefined}
          target={heroImage?.url ? "_blank" : undefined}
          rel="noreferrer"
          aria-label="Open full-size product image"
          className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/40 sm:size-20"
        >
          {heroImage?.url ? (
            <Image src={heroImage.url} alt={job.product} fill sizes="80px" className="object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-6" />
            </div>
          )}
        </a>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono text-sm font-bold text-secondary">{job.orderNumber}</div>
              <div className="truncate text-base font-bold text-foreground">{job.customerName}</div>
              <div className="truncate text-sm text-muted-foreground">{job.product}</div>
              {job.customerMobile && (
                <a
                  href={`tel:${job.customerMobile}`}
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:underline"
                >
                  <Phone className="size-3.5 shrink-0" />
                  {job.customerMobile}
                </a>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {job.priority === "urgent" && <Badge variant="destructive">Urgent</Badge>}
              <OrderStatusBadge status={job.status} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-muted/40 px-3.5 py-2.5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Delivery</div>
          <div className="text-sm font-bold text-foreground">
            {format(parseISO(job.deliveryDate), "EEE, MMM d")} · {formatDeliveryTime(job.deliveryTime)}
          </div>
        </div>
        <CountdownTimer deliveryDate={job.deliveryDate} deliveryTime={job.deliveryTime} />
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Spec label="Paper" value={job.paper || "—"} />
        <Spec label="Size" value={job.paperSize || "—"} />
        <Spec label="Qty" value={String(job.quantity)} />
        <Spec label="Finishing" value={job.finishing || "—"} />
      </div>

      {hasMultipleItems && (
        <button
          type="button"
          onClick={onOpenItems}
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
            readyItemCount === totalItemCount
              ? "border-success bg-success text-success-foreground hover:brightness-95"
              : "border-secondary bg-secondary text-secondary-foreground hover:brightness-110"
          )}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="size-4 shrink-0" />
            {totalItemCount} items — {readyItemCount}/{totalItemCount} ready
          </span>
          <span className="text-xs font-bold uppercase tracking-wide">Open</span>
        </button>
      )}

      {job.fulfillmentType === "delivery" && (job.deliveryAddress || job.deliveryMapLink) && (
        <a
          href={job.deliveryMapLink || buildGoogleMapsLink(job.deliveryAddress!)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-xl border border-secondary/30 bg-secondary/10 px-3.5 py-2.5 text-sm font-semibold text-secondary hover:bg-secondary/15"
        >
          <MapPin className="size-4 shrink-0" />
          <span className="truncate">{job.deliveryAddress || "Open map location"}</span>
        </a>
      )}

      {job.managerNotes && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/15 px-3.5 py-2.5">
          <NotebookPen className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-warning-foreground">Manager Notes</div>
            <p className="text-sm font-medium text-foreground">{job.managerNotes}</p>
          </div>
        </div>
      )}

      <MaterialRequestBadge types={job.pendingMaterialTypes} />

      {job.designFiles.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Design Files
          </div>
          <div className="flex flex-wrap gap-2">
            {job.designFiles.map((file) => (
              <a
                key={file.id}
                href={file.url ?? undefined}
                download={file.fileName}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-secondary/15"
              >
                <Download className="size-3.5 shrink-0" />
                {file.fileName}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
        <StatusActions
          status={job.status}
          fulfillmentType={job.fulfillmentType}
          isOutsourced={isOutsourced}
          pending={pending}
          onChange={onStatusChange}
          suppressDoneAction={hasMultipleItems}
          size="default"
        />
        {job.canHandOff && (
          <Button type="button" variant="primary" size="default" disabled={pending} onClick={onHandOff} className="flex-1 gap-2 sm:flex-none">
            <ArrowRightCircle className="size-4" />
            Ready for Next{job.nextEmployeeName ? ` (${job.nextEmployeeName})` : ""}
          </Button>
        )}
        <div className="flex gap-2 sm:ml-auto">
          <Button type="button" variant="outline" size="sm" onClick={onAddNote} className="gap-1.5">
            <NotebookPen className="size-3.5" />
            Add Note
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onRequestMaterial} className="gap-1.5">
            <PackagePlus className="size-3.5" />
            Request Material
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}
