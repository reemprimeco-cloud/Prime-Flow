"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { formatDeliveryTime } from "@/lib/utils/countdown";
import { ORDER_STATUS_LABELS } from "@/types/domain";
import type { TvDaySummary } from "@/lib/actions/tv";

const ROTATION_MS = 8_000;

export function TvWeeklySchedule({ week }: { week: TvDaySummary[] }) {
  const todayIndex = new Date().getDay();
  const [selected, setSelected] = useState(todayIndex);

  useEffect(() => {
    const interval = setInterval(() => {
      setSelected((prev) => (prev + 1) % 7);
    }, ROTATION_MS);
    return () => clearInterval(interval);
  }, []);

  const handleSelect = (index: number) => {
    setSelected(index);
  };

  const selectedDay = week[selected];

  return (
    <footer className="grid shrink-0 grid-cols-[2fr_3fr] gap-3 border-t-2 border-border bg-card px-5 py-2.5">
      <div className="grid grid-cols-7 gap-1.5">
        {week.map((day) => {
          const isSelected = day.dayIndex === selected;
          const isToday = day.dayIndex === todayIndex;
          return (
            <button
              key={day.dayIndex}
              type="button"
              onClick={() => handleSelect(day.dayIndex)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg border-2 px-1 py-1.5 transition-colors",
                isSelected ? "border-secondary bg-secondary/10" : "border-border bg-transparent"
              )}
            >
              <span className={cn("text-[11px] font-bold uppercase tracking-wide", isToday ? "text-secondary" : "text-muted-foreground")}>
                {day.label.slice(0, 3)}
              </span>
              <span className="font-mono text-lg font-extrabold tabular-nums">{day.totalOrders}</span>
              <span className="text-[10px] font-semibold text-muted-foreground">
                {day.completedOrders} done · {day.pendingOrders} left
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-w-0 rounded-xl border border-border p-2.5">
        <div className="mb-1 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
          {selectedDay.label}, {new Date(selectedDay.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </div>
        {selectedDay.orders.length === 0 ? (
          <div className="text-xs font-medium text-muted-foreground">No orders scheduled.</div>
        ) : (
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {selectedDay.orders.slice(0, 6).map((order, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <span className="font-mono font-bold text-secondary">{formatDeliveryTime(order.deliveryTime)}</span>
                <span className="font-semibold">{order.orderNumber}</span>
                <span className="text-muted-foreground">{order.customerName}</span>
                <span className="text-[10px] font-semibold text-muted-foreground">· {ORDER_STATUS_LABELS[order.status]}</span>
              </div>
            ))}
            {selectedDay.orders.length > 6 && (
              <span className="text-xs font-semibold text-muted-foreground">
                +{selectedDay.orders.length - 6} more
              </span>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
