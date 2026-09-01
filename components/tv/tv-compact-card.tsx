"use client";

import { memo, useEffect, useState } from "react";

import { formatCountdown, getCountdownColor, getMinutesRemaining, toDeliveryDate } from "@/lib/utils/countdown";
import { cn } from "@/lib/utils";
import type { TvOrderCardData } from "@/lib/actions/tv";

const CHIP_STYLES = {
  green: "bg-success text-white",
  yellow: "bg-warning text-warning-foreground",
  orange: "bg-warning text-warning-foreground",
  red: "bg-destructive text-white",
} as const;

/**
 * A minimal card for the narrow "Waiting for Materials" column -- order#,
 * customer, product, and a countdown pill, nothing else. Mirrors the
 * employee dashboard's compact Queue card (components/employee/queue-card.tsx):
 * this column is a glance for the shop floor, not a working view, and the
 * admin already has the full picture on the Manager dashboard's own board.
 */
export const TvCompactCard = memo(function TvCompactCard({ order }: { order: TvOrderCardData }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(interval);
  }, []);

  const deliveryAt = toDeliveryDate(order.deliveryDate, order.deliveryTime);
  const minutesRemaining = now ? getMinutesRemaining(deliveryAt, now) : 0;
  const color = now ? getCountdownColor(minutesRemaining) : "green";

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-2">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs font-extrabold">{order.orderNumber}</span>
        {order.priority === "urgent" && (
          <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-extrabold whitespace-nowrap text-white">
            URGENT
          </span>
        )}
      </div>
      <div className="truncate text-sm font-bold">{order.customerName}</div>
      <div className="truncate text-xs text-muted-foreground">{order.product}</div>
      {now && (
        <span className={cn("mt-0.5 w-fit rounded-md px-1.5 py-0.5 text-[10px] font-extrabold whitespace-nowrap", CHIP_STYLES[color])}>
          {formatCountdown(minutesRemaining)}
        </span>
      )}
    </div>
  );
});
