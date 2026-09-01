"use client";

import { memo, useEffect, useState } from "react";
import Image from "next/image";
import { Check, Clock, ImageIcon, Users } from "lucide-react";

import { formatCountdown, formatDeliveryTime, getCountdownColor, getMinutesRemaining, toDeliveryDate } from "@/lib/utils/countdown";
import { cn } from "@/lib/utils";
import type { TvOrderCardData } from "@/lib/actions/tv";

const ACCENT_STYLES = {
  green: "border-l-success",
  yellow: "border-l-warning",
  orange: "border-l-warning",
  red: "border-l-destructive",
} as const;

const CHIP_STYLES = {
  green: "bg-success text-white",
  yellow: "bg-warning text-warning-foreground",
  orange: "bg-warning text-warning-foreground",
  red: "bg-destructive text-white",
} as const;

/**
 * A single landscape strip -- thumbnail on the left, badges (urgent,
 * countdown) stacked in their own column on the right, and everything else
 * -- order#/customer, product, staff, time -- each gets its own full-width
 * row in between, rather than sharing a row with a badge that eats into
 * its space. An earlier version packed 2-3 fields per row, which worked at
 * a 1920px test width but truncated hard (single-letter names, three-char
 * product names) on real TV hardware running at a narrower resolution --
 * giving every field its own row means it degrades to truncating one long
 * value at a time instead of several short ones simultaneously.
 */
export const TvOrderCard = memo(function TvOrderCard({ order }: { order: TvOrderCardData }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(interval);
  }, []);

  const items = [
    { label: "Item 1", isReady: order.itemReady },
    ...order.additionalItems.map((item, index) => ({ label: `Item ${index + 2}`, isReady: item.isReady })),
  ];
  const hasMultipleItems = order.additionalItems.length > 0;

  const deliveryAt = toDeliveryDate(order.deliveryDate, order.deliveryTime);
  const minutesRemaining = now ? getMinutesRemaining(deliveryAt, now) : 0;
  const color = now ? getCountdownColor(minutesRemaining) : "green";

  const readyCount = items.filter((i) => i.isReady).length;

  return (
    <div className={cn("flex items-center gap-2.5 rounded-xl border border-border border-l-4 bg-card p-2 shadow-sm", ACCENT_STYLES[color])}>
      <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/60">
        {order.thumbnailUrl ? (
          <Image src={order.thumbnailUrl} alt="" fill sizes="48px" className="object-cover" />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="shrink-0 font-mono font-extrabold">{order.orderNumber}</span>
          <span className="min-w-0 truncate font-bold">{order.customerName}</span>
        </div>

        <div className="min-w-0 text-xs">
          <span className="inline-block max-w-full truncate rounded-md bg-secondary/10 px-1.5 py-0.5 font-bold text-secondary">
            {order.product}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
          <Users className="size-3 shrink-0" />
          <span className="truncate">{order.assignedEmployees.length > 0 ? order.assignedEmployees.join(", ") : "Unassigned"}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex shrink-0 items-center gap-1">
            <Clock className="size-3 shrink-0" />
            {formatDeliveryTime(order.deliveryTime)}
          </span>
          {hasMultipleItems && (
            <span
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                readyCount === items.length ? "bg-success text-white" : "bg-muted text-muted-foreground"
              )}
            >
              {readyCount === items.length && <Check className="size-2.5" />}
              {readyCount}/{items.length} items ready
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {order.priority === "urgent" && (
          <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-extrabold whitespace-nowrap text-white">
            URGENT
          </span>
        )}
        {now && (
          <span className={cn("rounded-lg px-2 py-1 text-xs font-extrabold whitespace-nowrap", CHIP_STYLES[color])}>
            {formatCountdown(minutesRemaining)}
          </span>
        )}
      </div>
    </div>
  );
});
