"use client";

import { memo } from "react";
import Image from "next/image";
import { Check, Clock, Users } from "lucide-react";

import { formatCountdown, formatDeliveryTime, getCountdownColor, getMinutesRemaining, toDeliveryDate } from "@/lib/utils/countdown";
import { cn } from "@/lib/utils";
import type { TvOrderCardData } from "@/lib/actions/tv";

export type TvCardDensity = "full" | "compact";

/**
 * Fixed card heights (rem, on the TV's 96 × 54rem canvas — see the TV
 * layout) so a column can work out how many fit before rendering them.
 */
export const TV_CARD_HEIGHT_REM: Record<TvCardDensity, number> = { full: 8.4, compact: 4.5 };

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
 * Read from across the room: the order number and its countdown on top,
 * then the customer large, then the product. A late order is tinted red
 * as a whole, not just its chip, so it's found before it's read. Every
 * field keeps its own line and truncates on its own, so a narrow TV
 * browser clips one long value instead of several short ones.
 *
 * "full" adds who's on it and its time; "compact" (when a column holds
 * more than full cards can show) keeps number, countdown, customer and
 * product.
 */
export const TvOrderCard = memo(function TvOrderCard({ order, now, density }: TvOrderCardProps) {
  const minutesRemaining = now ? getMinutesRemaining(toDeliveryDate(order.deliveryDate, order.deliveryTime), now) : 0;
  const color = now ? getCountdownColor(minutesRemaining) : "green";
  const isLate = now !== null && minutesRemaining < 0;

  const items = [order.itemReady, ...order.additionalItems.map((item) => item.isReady)];
  const readyCount = items.filter(Boolean).length;
  const hasMultipleItems = items.length > 1;
  const isFull = density === "full";

  return (
    <article
      style={{ height: `${TV_CARD_HEIGHT_REM[density]}rem` }}
      className={cn(
        "flex shrink-0 items-stretch gap-[0.8rem] overflow-hidden rounded-[0.9rem] border px-[0.9rem]",
        isFull ? "py-[0.7rem]" : "py-[0.5rem]",
        isLate ? "border-destructive/50 bg-destructive/10" : "border-border bg-card"
      )}
    >
      {isFull && order.thumbnailUrl && (
        <div className="relative aspect-square h-full shrink-0 overflow-hidden rounded-[0.6rem] border border-border bg-muted">
          <Image src={order.thumbnailUrl} alt="" fill sizes="160px" className="object-cover" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="flex shrink-0 items-center justify-between gap-[0.6rem]">
          <div className="flex min-w-0 items-center gap-[0.5rem]">
            <span className="shrink-0 text-[1.2rem] leading-none font-extrabold tabular-nums">{order.orderNumber}</span>
            {order.priority === "urgent" && (
              <span className="shrink-0 rounded-full bg-destructive px-[0.55rem] py-[0.15rem] text-[0.85rem] leading-tight font-extrabold tracking-wide text-white">
                URGENT
              </span>
            )}
          </div>
          {now && (
            <span
              className={cn(
                "shrink-0 rounded-[0.55rem] px-[0.6rem] py-[0.2rem] text-[1.15rem] leading-tight font-extrabold whitespace-nowrap tabular-nums",
                CHIP_STYLES[color]
              )}
            >
              {formatCountdown(minutesRemaining)}
            </span>
          )}
        </div>

        <div dir="auto" className={cn("shrink-0 truncate text-start leading-snug font-bold", isFull ? "text-[1.45rem]" : "text-[1.2rem]")}>
          {isFull ? (
            order.customerName
          ) : (
            <>
              {order.customerName}
              <span className="font-medium text-muted-foreground">
                {" · "}
                <bdi>{order.product}</bdi>
              </span>
            </>
          )}
        </div>

        {isFull && (
          <>
            <div dir="auto" className="shrink-0 truncate text-start text-[1.1rem] leading-snug font-semibold text-secondary">
              {order.product}
            </div>
            <div className="flex min-w-0 shrink-0 items-center gap-[0.9rem] text-[1rem] leading-snug text-muted-foreground">
              <span className="flex min-w-0 items-center gap-[0.35rem]">
                <Users className="size-[1rem] shrink-0" aria-hidden />
                <span className="truncate">
                  {order.assignedEmployees.length > 0 ? order.assignedEmployees.join(", ") : "Unassigned"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-[0.35rem] tabular-nums">
                <Clock className="size-[1rem] shrink-0" aria-hidden />
                {formatDeliveryTime(order.deliveryTime)}
              </span>
              {hasMultipleItems && (
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-[0.25rem] rounded-[0.45rem] px-[0.45rem] py-[0.1rem] font-bold",
                    readyCount === items.length ? "bg-success text-white" : "bg-muted text-foreground"
                  )}
                >
                  {readyCount === items.length && <Check className="size-[0.9rem]" aria-hidden />}
                  {readyCount}/{items.length} ready
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
});
