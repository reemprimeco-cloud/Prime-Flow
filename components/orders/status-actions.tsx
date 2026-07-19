"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getEmployeeNextActions } from "@/types/domain";
import type { OrderFulfillmentType, OrderStatus } from "@/types/database.types";

const SUCCESS_TARGETS: OrderStatus[] = ["ready_pickup", "ready_delivery", "collected", "delivered"];

interface StatusActionsProps {
  status: OrderStatus;
  fulfillmentType: OrderFulfillmentType;
  isOutsourced: boolean;
  pending: boolean;
  onChange: (status: OrderStatus) => void;
  /**
   * Hides the "done" action (Ready for Pickup/Delivery/Internal Pickup) from
   * `in_progress` — used for multi-item orders, where that transition is
   * gated behind every item's readiness checkbox and fires automatically
   * (see toggleJobItemReady) rather than through a manual click here.
   */
  suppressDoneAction?: boolean;
}

export function StatusActions({
  status,
  fulfillmentType,
  isOutsourced,
  pending,
  onChange,
  suppressDoneAction,
}: StatusActionsProps) {
  let actions = getEmployeeNextActions(status, fulfillmentType, isOutsourced);
  if (suppressDoneAction && status === "in_progress") actions = actions.slice(0, -1);
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2.5">
      {actions.map((action) => (
        <Button
          key={action.status}
          type="button"
          size="lg"
          variant={SUCCESS_TARGETS.includes(action.status) ? "success" : "primary"}
          disabled={pending}
          onClick={() => onChange(action.status)}
          className="min-w-[168px] flex-1 sm:flex-none"
        >
          {pending && <Loader2 className="animate-spin" />}
          {action.label}
        </Button>
      ))}
    </div>
  );
}
