import { TvOrderCard } from "@/components/tv/tv-order-card";
import { ORDER_STATUS_LABELS } from "@/types/domain";
import type { TvOrderCardData } from "@/lib/actions/tv";
import type { TvColumnKey } from "@/types/domain";

const MAX_VISIBLE = 5;

interface TvStatusColumnProps {
  status: TvColumnKey;
  orders: TvOrderCardData[];
}

export function TvStatusColumn({ status, orders }: TvStatusColumnProps) {
  const visible = orders.slice(0, MAX_VISIBLE);
  const overflow = orders.length - visible.length;

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xl font-extrabold">{ORDER_STATUS_LABELS[status]}</h2>
        <span className="flex size-9 items-center justify-center rounded-full bg-muted font-mono text-lg font-extrabold tabular-nums">
          {orders.length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3">
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
