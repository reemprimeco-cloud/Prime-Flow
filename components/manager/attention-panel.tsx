"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, CircleCheck } from "lucide-react";
import { format, parseISO } from "date-fns";

import { formatDeliveryTime, getMinutesRemaining, toDeliveryDate } from "@/lib/utils/countdown";
import { cn } from "@/lib/utils";
import { DELAYABLE_STATUSES, MATERIAL_TYPE_LABELS } from "@/types/domain";
import type { DashboardBoardResult, OrderListItem } from "@/lib/actions/orders";

/** "Due soon" window: anything in production with less than this many minutes left. */
const DUE_SOON_MINUTES = 120;
/** Rows shown before "Show all". */
const COLLAPSED_ROWS = 5;

type Reason = "late" | "changes_requested" | "materials" | "needs_approval" | "awaiting_customer" | "due_soon";

/** Severity order — an order is listed once, under its most severe reason. */
const REASON_RANK: Record<Reason, number> = {
  late: 0,
  changes_requested: 1,
  materials: 2,
  needs_approval: 3,
  awaiting_customer: 4,
  due_soon: 5,
};

/**
 * Tint + dark ink pairs, so the label clears 4.5:1 on its own tint (the
 * full-strength status colors on a 15% tint measure 1.9–3.1:1).
 */
const REASON_TONE: Record<"red" | "amber", string> = {
  red: "bg-destructive/10 text-red-700",
  amber: "bg-warning/15 text-amber-800",
};

interface AttentionItem {
  order: OrderListItem;
  reason: Reason;
  minutes: number;
}

function reasonFor(order: OrderListItem, minutes: number): Reason | null {
  const inProduction = DELAYABLE_STATUSES.includes(order.status);
  if (inProduction && minutes < 0) return "late";
  if (order.status === "new" && order.designApprovalStatus === "changes_requested") return "changes_requested";
  if (order.status === "waiting_materials" || order.pendingMaterialTypes.length > 0) return "materials";
  if (order.status === "new" && !order.approved) return "needs_approval";
  if (order.status === "new" && order.designApprovalStatus === "pending") return "awaiting_customer";
  if (inProduction && minutes < DUE_SOON_MINUTES) return "due_soon";
  return null;
}

function formatSpan(minutes: number): string {
  const abs = Math.abs(minutes);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const mins = abs % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

function reasonLabel(item: AttentionItem): { text: string; tone: "red" | "amber" } {
  switch (item.reason) {
    case "late":
      return { text: `${formatSpan(item.minutes)} late`, tone: "red" };
    case "changes_requested":
      return { text: "Design changes requested", tone: "red" };
    case "materials": {
      const types = item.order.pendingMaterialTypes.map((t) => MATERIAL_TYPE_LABELS[t]);
      return { text: types.length > 0 ? `Waiting for ${types.join(", ").toLowerCase()}` : "Waiting for materials", tone: "red" };
    }
    case "needs_approval":
      return { text: "Needs your approval", tone: "amber" };
    case "awaiting_customer":
      return { text: "Awaiting customer approval", tone: "amber" };
    case "due_soon":
      return { text: `Due in ${formatSpan(item.minutes)}`, tone: "amber" };
  }
}

/** Ticks once a minute so "late" and "due soon" stay true without a refetch. */
function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);
  return now;
}

interface AttentionPanelProps {
  board: DashboardBoardResult;
  onOpen: (order: OrderListItem) => void;
}

/**
 * The dashboard's first answer: which orders need a decision or are about
 * to slip, most urgent first. Every order on the live board is checked; each
 * appears once, under its most severe reason, sorted by severity then
 * deadline. Rows open the order — the actions themselves stay on the card
 * and in the drawer, so there's one place each action lives.
 */
export function AttentionPanel({ board, onOpen }: AttentionPanelProps) {
  const now = useNow();
  const [expanded, setExpanded] = useState(false);

  const { items, nextDue } = useMemo(() => {
    if (!now) return { items: [] as AttentionItem[], nextDue: null as AttentionItem | null };
    const live = [
      ...board.new,
      ...board.inProgress,
      ...board.waitingMaterials,
      ...board.readyPickup,
      ...board.readyDelivery,
    ];
    const flagged: AttentionItem[] = [];
    let soonest: AttentionItem | null = null;
    for (const order of live) {
      const minutes = getMinutesRemaining(toDeliveryDate(order.deliveryDate, order.deliveryTime), now);
      const reason = reasonFor(order, minutes);
      if (reason) flagged.push({ order, reason, minutes });
      else if (DELAYABLE_STATUSES.includes(order.status) && (!soonest || minutes < soonest.minutes)) {
        soonest = { order, reason: "due_soon", minutes };
      }
    }
    flagged.sort((a, b) => REASON_RANK[a.reason] - REASON_RANK[b.reason] || a.minutes - b.minutes);
    return { items: flagged, nextDue: soonest };
  }, [board, now]);

  if (!now) return null;

  if (items.length === 0) {
    return (
      <section id="needs-attention" aria-label="Needs attention" className="scroll-mt-20">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
          <span className="font-semibold text-foreground">All clear</span>
          <span className="text-muted-foreground">Nothing late, blocked, or due in the next 2 hours.</span>
          {nextDue && (
            <button
              type="button"
              onClick={() => onOpen(nextDue.order)}
              className="ml-auto rounded-lg text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Next due: <span className="font-mono font-bold text-foreground">{nextDue.order.orderNumber}</span> in{" "}
              {formatSpan(nextDue.minutes)}
            </button>
          )}
        </div>
      </section>
    );
  }

  const visible = expanded ? items : items.slice(0, COLLAPSED_ROWS);
  const lateCount = items.filter((i) => i.reason === "late").length;

  return (
    <section id="needs-attention" aria-labelledby="needs-attention-title" className="flex scroll-mt-20 flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 id="needs-attention-title" className="text-base font-bold text-foreground">
          Needs attention
        </h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {items.length} order{items.length === 1 ? "" : "s"}
          {lateCount > 0 && <span className="font-semibold text-red-700"> · {lateCount} late</span>}
        </span>
      </div>

      <ol className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {visible.map((item) => {
          const { text, tone } = reasonLabel(item);
          const { order } = item;
          const assignees = order.assignedEmployees.map((e) => e.fullName.split(" ")[0]).join(", ");
          return (
            <li key={order.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => onOpen(order)}
                className={cn(
                  // Phone: reason + due time on the first line, the order on the second.
                  // md+: one line — reason | order | due time.
                  "grid w-full min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors",
                  "hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  "md:grid-cols-[13rem_minmax(0,1fr)_auto] md:gap-x-4"
                )}
              >
                <span
                  className={cn(
                    "w-fit max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
                    REASON_TONE[tone]
                  )}
                >
                  {text}
                </span>
                <span className="justify-self-end text-xs whitespace-nowrap text-muted-foreground tabular-nums md:order-last">
                  {format(parseISO(order.deliveryDate), "EEE d MMM")} · {formatDeliveryTime(order.deliveryTime)}
                </span>
                <span className="col-span-2 min-w-0 truncate text-sm md:col-span-1">
                  <span className="font-mono font-bold text-foreground">{order.orderNumber}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="font-semibold text-foreground">{order.customerName}</span>
                  <span className="text-muted-foreground"> · {order.product}</span>
                  {assignees && <span className="text-muted-foreground"> · {assignees}</span>}
                  {!assignees && order.status !== "ready_pickup" && order.status !== "ready_delivery" && (
                    <span className="text-muted-foreground"> · Unassigned</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {items.length > COLLAPSED_ROWS && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-fit items-center gap-1.5 rounded-lg px-1 py-2 text-sm font-semibold text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? "Show fewer" : `Show all ${items.length}`}
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
      )}
    </section>
  );
}
