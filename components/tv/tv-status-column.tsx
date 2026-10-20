"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Loader, Inbox, MapPinCheck, Truck } from "lucide-react";

import { TvOrderCard, TV_CARD_HEIGHT_REM, type TvCardDensity } from "@/components/tv/tv-order-card";
import { ORDER_STATUS_LABELS } from "@/types/domain";
import type { TvOrderCardData } from "@/lib/actions/tv";
import type { TvColumnKey } from "@/types/domain";

/** Space between cards, and the "+N more" row's height — rem, like the card heights. */
const GAP_REM = 0.6;
const MORE_ROW_REM = 2.4;

const COLUMN_STYLE: Record<TvColumnKey, { icon: typeof Loader; className: string }> = {
  in_progress: { icon: Loader, className: "bg-secondary/10 text-secondary" },
  ready_pickup: { icon: MapPinCheck, className: "bg-success/10 text-success" },
  ready_delivery: { icon: Truck, className: "bg-violet-500/10 text-violet-600" },
  new: { icon: Inbox, className: "bg-warning/15 text-amber-700" },
};

// TV-only label override -- everywhere else (Manager/Employee dashboards,
// order status badges) keeps ORDER_STATUS_LABELS' "New", which describes
// the underlying order_status value; the TV board's audience just needs a
// heading for what's waiting to start.
const TV_COLUMN_LABELS: Partial<Record<TvColumnKey, string>> = {
  new: "Queue Orders",
};

interface Layout {
  density: TvCardDensity;
  visible: number;
}

function cardsThatFit(availablePx: number, remPx: number, cardRem: number): number {
  return Math.max(0, Math.floor((availablePx + GAP_REM * remPx) / ((cardRem + GAP_REM) * remPx)));
}

/**
 * Full cards while they all fit, compact ones once they don't, and "+N
 * more" only past what compact cards can hold — worked out from the
 * column's real height on this screen, since a TV remote can't scroll.
 * Orders arrive soonest-due first, so anything cut is the least urgent.
 */
function planLayout(total: number, availablePx: number, remPx: number): Layout {
  if (total <= cardsThatFit(availablePx, remPx, TV_CARD_HEIGHT_REM.full)) return { density: "full", visible: total };
  if (total <= cardsThatFit(availablePx, remPx, TV_CARD_HEIGHT_REM.compact)) return { density: "compact", visible: total };
  const withMoreRow = availablePx - (MORE_ROW_REM + GAP_REM) * remPx;
  return { density: "compact", visible: cardsThatFit(withMoreRow, remPx, TV_CARD_HEIGHT_REM.compact) };
}

interface TvStatusColumnProps {
  status: TvColumnKey;
  orders: TvOrderCardData[];
  now: Date | null;
}

export function TvStatusColumn({ status, orders, now }: TvStatusColumnProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>({ density: "full", visible: orders.length });

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const style = getComputedStyle(el);
      const available = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const next = planLayout(orders.length, available, remPx);
      setLayout((prev) => (prev.density === next.density && prev.visible === next.visible ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [orders.length]);

  const visible = orders.slice(0, layout.visible);
  const overflow = orders.length - visible.length;
  const { icon: Icon, className: iconClassName } = COLUMN_STYLE[status];

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[1.1rem] bg-card shadow-[0_0.25rem_1rem_-0.25rem_rgba(10,31,68,0.25)]">
      <header className="flex shrink-0 items-center justify-between gap-[0.75rem] border-b border-border px-[1rem] py-[0.8rem]">
        <div className="flex min-w-0 items-center gap-[0.7rem]">
          <span className={`flex size-[2.4rem] shrink-0 items-center justify-center rounded-[0.7rem] ${iconClassName}`}>
            <Icon className="size-[1.35rem]" />
          </span>
          <h2 className="truncate text-[1.6rem] leading-tight font-extrabold">
            {TV_COLUMN_LABELS[status] ?? ORDER_STATUS_LABELS[status]}
          </h2>
        </div>
        <span className="flex h-[2.4rem] min-w-[2.4rem] shrink-0 items-center justify-center rounded-full bg-muted px-[0.6rem] text-[1.5rem] font-extrabold tabular-nums">
          {orders.length}
        </span>
      </header>
      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-[0.6rem] overflow-hidden p-[0.75rem]"
      >
        {orders.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-[1.3rem] font-semibold text-muted-foreground">
            Nothing here
          </div>
        ) : (
          visible.map((order) => <TvOrderCard key={order.id} order={order} now={now} density={layout.density} />)
        )}
        {overflow > 0 && (
          <div className="flex h-[2.4rem] shrink-0 items-center justify-center rounded-[0.8rem] bg-muted text-[1.2rem] font-bold text-muted-foreground">
            +{overflow} more
          </div>
        )}
      </div>
    </section>
  );
}
