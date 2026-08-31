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
 * A single landscape strip -- thumbnail on the left, everything else laid
 * out inline across three compact rows on the right, rather than the old
 * design's four/five stacked lines. Wider and shorter per card means more
 * of them fit down a column now that the footer's gone (see
 * tv-dashboard-client.tsx) and there's no scrolling to fall back on for a
 * TV remote.
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
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono font-extrabold">{order.orderNumber}</span>
          <span className="min-w-0 flex-1 truncate font-bold">{order.customerName}</span>
          {order.priority === "urgent" && (
            <span className="shrink-0 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-extrabold text-white">URGENT</span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="min-w-0 max-w-[55%] truncate rounded-md bg-secondary/10 px-1.5 py-0.5 font-bold text-secondary">
            {order.product}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-muted-foreground">
            <Users className="size-3 shrink-0" />
            {order.assignedEmployees.length > 0 ? order.assignedEmployees.join(", ") : "Unassigned"}
          </span>
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

      {now && (
        <span className={cn("shrink-0 rounded-lg px-2 py-1 text-xs font-extrabold whitespace-nowrap", CHIP_STYLES[color])}>
          {formatCountdown(minutesRemaining)}
        </span>
      )}
    </div>
  );
});
