"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

import { listCalendarOrders, type CalendarOrder } from "@/lib/actions/calendar";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { CHANNELS } from "@/lib/realtime/constants";
import { formatDeliveryTime } from "@/lib/utils/countdown";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/types/domain";

type ViewMode = "day" | "week" | "month";

function rangeFor(view: ViewMode, anchor: Date): { start: Date; end: Date } {
  if (view === "day") return { start: anchor, end: anchor };
  if (view === "week") return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
  return { start: startOfWeek(startOfMonth(anchor)), end: endOfWeek(endOfMonth(anchor)) };
}

export function CalendarClient({ initialOrders }: { initialOrders: CalendarOrder[] }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());

  const { start, end } = rangeFor(view, anchor);
  const startIso = format(start, "yyyy-MM-dd");
  const endIso = format(end, "yyyy-MM-dd");
  const queryKey = ["calendar-orders", startIso, endIso];

  const query = useQuery({
    queryKey,
    queryFn: () => listCalendarOrders(startIso, endIso),
    initialData: isSameDay(start, rangeFor("month", new Date()).start) ? initialOrders : undefined,
    refetchInterval: 30_000,
  });

  useRealtimeChannel(CHANNELS.production, () => queryClient.invalidateQueries({ queryKey }));

  const ordersByDay = useMemo(() => {
    const map = new Map<string, CalendarOrder[]>();
    for (const o of query.data ?? []) {
      const list = map.get(o.deliveryDate) ?? [];
      list.push(o);
      map.set(o.deliveryDate, list);
    }
    return map;
  }, [query.data]);

  const navigate = (direction: -1 | 1) => {
    if (view === "day") setAnchor((d) => addDays(d, direction));
    else if (view === "week") setAnchor((d) => (direction === 1 ? addWeeks(d, 1) : subWeeks(d, 1)));
    else setAnchor((d) => (direction === 1 ? addMonths(d, 1) : subMonths(d, 1)));
  };

  const goToday = () => {
    setAnchor(new Date());
    setSelectedDay(new Date());
  };

  const days = eachDayOfInterval({ start, end });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Production Calendar</h1>
          <p className="text-sm text-muted-foreground">Delivery &amp; pickup schedule</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-border p-1">
            {(["day", "week", "month"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                  view === v ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => navigate(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <span className="ml-1 text-sm font-semibold text-foreground">
            {view === "month" ? format(anchor, "MMMM yyyy") : view === "week" ? `Week of ${format(start, "MMM d")}` : format(anchor, "EEEE, MMM d")}
          </span>
        </div>
      </div>

      {view === "month" && (
        <Card className="p-4">
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-2">
            {days.map((day) => {
              const iso = format(day, "yyyy-MM-dd");
              const dayOrders = ordersByDay.get(iso) ?? [];
              const overdueCount = dayOrders.filter((o) => o.isOverdue).length;
              const urgentCount = dayOrders.filter((o) => o.priority === "urgent").length;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    setSelectedDay(day);
                    setView("day");
                    setAnchor(day);
                  }}
                  className={cn(
                    "flex min-h-20 flex-col items-start gap-1 rounded-lg border p-2 text-left transition-colors hover:border-secondary",
                    isSameMonth(day, anchor) ? "border-border" : "border-border/40 opacity-50",
                    isToday(day) && "border-secondary bg-secondary/5"
                  )}
                >
                  <span className={cn("text-xs font-semibold", isToday(day) && "text-secondary")}>{format(day, "d")}</span>
                  {dayOrders.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="muted">{dayOrders.length}</Badge>
                      {urgentCount > 0 && <Badge variant="destructive">{urgentCount} urgent</Badge>}
                      {overdueCount > 0 && <Badge variant="warning">{overdueCount} overdue</Badge>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {view === "week" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
          {days.map((day) => {
            const iso = format(day, "yyyy-MM-dd");
            const dayOrders = ordersByDay.get(iso) ?? [];
            return (
              <Card key={iso} className={cn("flex flex-col gap-2 p-3", isToday(day) && "border-secondary")}>
                <button type="button" onClick={() => { setSelectedDay(day); setView("day"); setAnchor(day); }} className="text-left">
                  <span className="text-xs font-bold text-muted-foreground">{format(day, "EEE")}</span>
                  <span className={cn("ml-1.5 text-sm font-bold", isToday(day) && "text-secondary")}>{format(day, "d")}</span>
                </button>
                <div className="flex flex-col gap-1.5">
                  {dayOrders.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No orders</p>
                  ) : (
                    dayOrders.slice(0, 4).map((o) => <OrderChip key={o.id} order={o} />)
                  )}
                  {dayOrders.length > 4 && (
                    <span className="text-xs text-muted-foreground">+{dayOrders.length - 4} more</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {view === "day" && (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-sm font-bold text-muted-foreground">{format(selectedDay, "EEEE, MMMM d")}</h2>
          {(ordersByDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders scheduled for this day.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(ordersByDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-secondary">{formatDeliveryTime(o.deliveryTime)}</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {o.orderNumber} · {o.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground">{o.product}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {o.priority === "urgent" && <Badge variant="destructive">Urgent</Badge>}
                    {o.isOverdue && (
                      <Badge variant="warning">
                        <AlertTriangle className="size-3" /> Overdue
                      </Badge>
                    )}
                    <Badge variant="muted">{ORDER_STATUS_LABELS[o.status]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function OrderChip({ order }: { order: CalendarOrder }) {
  return (
    <div
      className={cn(
        "truncate rounded-md px-2 py-1 text-xs font-medium",
        order.isOverdue
          ? "bg-destructive/15 text-destructive"
          : order.priority === "urgent"
            ? "bg-warning/15 text-warning"
            : "bg-muted text-foreground"
      )}
      title={`${order.orderNumber} · ${order.customerName}`}
    >
      {formatDeliveryTime(order.deliveryTime)} {order.orderNumber}
    </div>
  );
}
