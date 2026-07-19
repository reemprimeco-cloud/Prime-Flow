"use client";

import Image from "next/image";
import { ArrowRightCircle, Download, ImageIcon, ListChecks, MapPin, NotebookPen, PackagePlus } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountdownTimer, useCountdownColor } from "@/components/orders/countdown-timer";
import { MaterialRequestBadge } from "@/components/orders/material-request-badge";
import { StatusActions } from "@/components/orders/status-actions";
import { cn } from "@/lib/utils";
import { buildGoogleMapsLink } from "@/lib/utils/maps";
import type { EmployeeJobItem } from "@/lib/actions/employee-jobs";
import type { OrderStatus } from "@/types/database.types";

const ACCENT_BORDER = {
  green: "border-l-success",
  yellow: "border-l-warning",
  orange: "border-l-warning",
  red: "border-l-destructive",
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
    <Card className={cn("flex flex-col gap-5 border-l-[6px] p-5 md:p-6", ACCENT_BORDER[countdownColor])}>
      <div className="flex flex-col gap-5 md:flex-row">
        <div className="relative h-56 w-full shrink-0 overflow-hidden rounded-2xl border border-border bg-muted/40 md:h-auto md:w-56">
          {heroImage?.url ? (
            <a href={heroImage.url} target="_blank" rel="noreferrer" aria-label="Open full-size product image">
              <Image src={heroImage.url} alt={job.product} fill sizes="(min-width: 768px) 224px, 100vw" className="object-cover" />
            </a>
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-10" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-mono text-base font-bold text-secondary">{job.orderNumber}</div>
              <div className="text-xl font-extrabold leading-tight">{job.customerName}</div>
              <div className="text-muted-foreground">{job.product}</div>
            </div>
            {job.priority === "urgent" && (
              <Badge variant="destructive" className="px-3 py-1.5 text-sm">
                Urgent
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Spec label="Paper" value={job.paper || "—"} />
            <Spec label="Size" value={job.paperSize || "—"} />
            <Spec label="Qty" value={String(job.quantity)} />
            <Spec label="Finishing" value={job.finishing || "—"} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Delivery
              </div>
              <div className="text-lg font-extrabold">
                {format(parseISO(job.deliveryDate), "EEE, MMM d")} · {job.deliveryTime.slice(0, 5)}
              </div>
            </div>
            <CountdownTimer deliveryDate={job.deliveryDate} deliveryTime={job.deliveryTime} size="lg" />
          </div>

          {hasMultipleItems && (
            <button
              type="button"
              onClick={onOpenItems}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                readyItemCount === totalItemCount
                  ? "border-success/40 bg-success/10 hover:bg-success/15"
                  : "border-secondary/30 bg-secondary/10 hover:bg-secondary/15"
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ListChecks className="size-4 shrink-0 text-secondary" />
                {totalItemCount} items — {readyItemCount}/{totalItemCount} ready
              </span>
              <span className="text-xs font-bold uppercase tracking-wide text-secondary">Open</span>
            </button>
          )}

          {job.fulfillmentType === "delivery" && job.deliveryAddress && (
            <a
              href={buildGoogleMapsLink(job.deliveryAddress)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3 text-sm font-semibold text-secondary hover:bg-secondary/15"
            >
              <MapPin className="size-4 shrink-0" />
              {job.deliveryAddress}
            </a>
          )}

          {job.managerNotes && (
            <div className="flex items-start gap-2.5 rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3">
              <NotebookPen className="mt-0.5 size-4 shrink-0 text-secondary" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-secondary">Manager Notes</div>
                <p className="text-sm text-foreground">{job.managerNotes}</p>
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
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
        <StatusActions
          status={job.status}
          fulfillmentType={job.fulfillmentType}
          isOutsourced={isOutsourced}
          pending={pending}
          onChange={onStatusChange}
          suppressDoneAction={hasMultipleItems}
        />
        {job.canHandOff && (
          <Button type="button" variant="primary" size="lg" disabled={pending} onClick={onHandOff} className="gap-2">
            <ArrowRightCircle className="size-4" />
            Ready for Next{job.nextEmployeeName ? ` (${job.nextEmployeeName})` : ""}
          </Button>
        )}
        <div className="ml-auto flex gap-2.5">
          <Button type="button" variant="outline" size="lg" onClick={onAddNote} className="gap-2">
            <NotebookPen className="size-4" />
            Add Note
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={onRequestMaterial} className="gap-2">
            <PackagePlus className="size-4" />
            Request Material
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}
