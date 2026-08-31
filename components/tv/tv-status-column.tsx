import { Loader, Hourglass, MapPinCheck, Truck } from "lucide-react";

import { TvOrderCard } from "@/components/tv/tv-order-card";
import { ORDER_STATUS_LABELS } from "@/types/domain";
import type { TvOrderCardData } from "@/lib/actions/tv";
import type { TvColumnKey } from "@/types/domain";

// The footer that used to eat a row of vertical space is gone (see
// tv-dashboard-client.tsx) and cards are a compact landscape strip now
// (tv-order-card.tsx), so a lot more fits per column without scrolling --
// a TV remote can't scroll, so "+N more" is the only fallback past this cap.
const MAX_VISIBLE = 10;

const COLUMN_STYLE: Record<TvColumnKey, { icon: typeof Loader; className: string }> = {
  in_progress: { icon: Loader, className: "bg-secondary/10 text-secondary" },
  waiting_materials: { icon: Hourglass, className: "bg-warning/10 text-warning" },
  ready_pickup: { icon: MapPinCheck, className: "bg-success/10 text-success" },
  ready_delivery: { icon: Truck, className: "bg-violet-500/10 text-violet-600" },
};

interface TvStatusColumnProps {
  status: TvColumnKey;
  orders: TvOrderCardData[];
}

export function TvStatusColumn({ status, orders }: TvStatusColumnProps) {
  const visible = orders.slice(0, MAX_VISIBLE);
  const overflow = orders.length - visible.length;
  const { icon: Icon, className: iconClassName } = COLUMN_STYLE[status];

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
            <Icon className="size-4" />
          </span>
          <h2 className="text-lg font-extrabold">{ORDER_STATUS_LABELS[status]}</h2>
        </div>
        <span className="flex size-8 items-center justify-center rounded-full bg-muted font-mono text-base font-extrabold tabular-nums">
          {orders.length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2.5">
        {visible.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm font-medium text-muted-foreground">
            Nothing here
          </div>
        ) : (
          visible.map((order) => <TvOrderCard key={order.id} order={order} />)
        )}
        {overflow > 0 && (
          <div className="rounded-xl border border-dashed border-border py-2 text-center text-sm font-bold text-muted-foreground">
            +{overflow} more
          </div>
        )}
      </div>
    </div>
  );
}
