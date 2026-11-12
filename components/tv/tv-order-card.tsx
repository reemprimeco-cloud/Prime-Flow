"use client";

import { memo } from "react";

import { formatCountdown, getCountdownColor, getMinutesRemaining, toDeliveryDate } from "@/lib/utils/countdown";
import { cn } from "@/lib/utils";
import type { TvOrderCardData } from "@/lib/actions/tv";

export type TvCardDensity = "full" | "compact";

/**
 * Fixed card heights (rem, on the TV's 96 × 54rem canvas — see the TV
 * layout) so a column can work out how many fit before rendering them.
 */
export const TV_CARD_HEIGHT_REM: Record<TvCardDensity, number> = { full: 7.4, compact: 4.5 };

const CHIP_STYLES = {
  green: "bg-success text-white",
  yellow: "bg-warning text-warning-foreground",
  orange: "bg-warning text-warning-foreground",
  red: "bg-destructive text-white",
} as const;

interface TvOrderCardProps {
  order: TvOrderCardData;
  now: Date | null;
  density: TvCardDensity;
}

/**
 * Only what the floor reads from across the room: which order, how long
 * it has, whose it is, and what it is. Who's assigned, the delivery time
 * and item readiness live on the staff's own screens; on the TV they were
 * detail nobody could read from a distance. A late order is tinted red as
 * a whole, so it's found before it's read. Each field truncates on its
 * own, so a narrow TV browser clips one long value, not several.
 *
 * "compact" (when a column holds more than full cards can show) puts
 * customer and product on one line.
 */
export const TvOrderCard = memo(function TvOrderCard({ order, now, density }: TvOrderCardProps) {
  const minutesRemaining = now ? getMinutesRemaining(toDeliveryDate(order.deliveryDate, order.deliveryTime), now) : 0;
  const color = now ? getCountdownColor(minutesRemaining) : "green";
  const isLate = now !== null && minutesRemaining < 0;
  const isFull = density === "full";

  return (
    <article
      style={{ height: `${TV_CARD_HEIGHT_REM[density]}rem` }}
      className={cn(
        "flex shrink-0 flex-col justify-between overflow-hidden rounded-[0.9rem] border px-[1rem]",
        isFull ? "py-[0.75rem]" : "py-[0.5rem]",
        isLate ? "border-destructive/50 bg-destructive/10" : "border-border bg-card"
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-[0.6rem]">
        <div className="flex min-w-0 items-center gap-[0.5rem]">
          <span className="shrink-0 text-[1.25rem] leading-none font-extrabold tabular-nums">{order.orderNumber}</span>
          {order.priority === "urgent" && (
            <span className="shrink-0 rounded-full bg-destructive px-[0.55rem] py-[0.15rem] text-[0.85rem] leading-tight font-extrabold tracking-wide text-white">
              URGENT
            </span>
          )}
        </div>
        {now && (
          <span
            className={cn(
              "shrink-0 rounded-[0.55rem] px-[0.6rem] py-[0.2rem] text-[1.2rem] leading-tight font-extrabold whitespace-nowrap tabular-nums",
              CHIP_STYLES[color]
            )}
          >
            {formatCountdown(minutesRemaining)}
          </span>
        )}
      </div>

      {isFull ? (
        <>
          <div dir="auto" className="shrink-0 truncate text-left text-[1.6rem] leading-snug font-bold">
            {order.customerName}
          </div>
          <div dir="auto" className="shrink-0 truncate text-left text-[1.15rem] leading-snug font-medium text-muted-foreground">
            {order.product}
          </div>
        </>
      ) : (
        <div dir="auto" className="shrink-0 truncate text-left text-[1.25rem] leading-snug font-bold">
          {order.customerName}
          <span className="font-medium text-muted-foreground">
            {" · "}
            <bdi>{order.product}</bdi>
          </span>
        </div>
      )}
    </article>
  );
});
