"use client";

import { memo, useEffect, useState } from "react";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { Check, ImageIcon, Users } from "lucide-react";

import { formatCountdown, formatDeliveryTime, getCountdownColor, getMinutesRemaining, toDeliveryDate } from "@/lib/utils/countdown";
import { cn } from "@/lib/utils";
import type { TvOrderCardData } from "@/lib/actions/tv";

const COLOR_STYLES = {
  green: "border-success bg-success/10",
  yellow: "border-warning bg-warning/10",
  orange: "border-warning bg-warning/15",
  red: "border-destructive bg-destructive/10",
} as const;

const CHIP_STYLES = {
  green: "bg-success text-white",
  yellow: "bg-warning text-warning-foreground",
  orange: "bg-warning text-warning-foreground",
  red: "bg-destructive text-white",
} as const;

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

  return (
    <div className={cn("flex gap-3 rounded-2xl border-2 p-3", COLOR_STYLES[color])}>
      <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/60">
        {order.thumbnailUrl ? (
          <Image src={order.thumbnailUrl} alt="" fill sizes="80px" className="object-cover" />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-lg font-extrabold">{order.orderNumber}</span>
          {order.priority === "urgent" && (
            <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-extrabold text-white">URGENT</span>
          )}
        </div>
        <div className="truncate text-base font-bold">{order.customerName}</div>
        <div className="mb-1.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
          <Users className="size-3.5 shrink-0" />
          {order.assignedEmployees.length > 0 ? order.assignedEmployees.join(", ") : "Unassigned"}
        </div>
        {hasMultipleItems && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {items.map((item) => (
              <span
                key={item.label}
                className={cn(
                  "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold",
                  item.isReady ? "bg-success text-white" : "bg-muted text-muted-foreground"
                )}
              >
                {item.isReady && <Check className="size-3" />}
                {item.label} {item.isReady ? "Ready" : "Pending"}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-muted-foreground">
            {format(parseISO(order.deliveryDate), "EEE, MMM d")} · {formatDeliveryTime(order.deliveryTime)}
          </span>
          {now && (
            <span className={cn("rounded-lg px-2.5 py-1 text-sm font-extrabold whitespace-nowrap", CHIP_STYLES[color])}>
              {formatCountdown(minutesRemaining)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
