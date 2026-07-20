"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getEmployeeNextActions } from "@/types/domain";
import type { OrderFulfillmentType, OrderStatus } from "@/types/database.types";

const SUCCESS_TARGETS: OrderStatus[] = ["ready_pickup", "ready_delivery", "collected", "delivered"];

/**
 * Marking an order Delivered is final and easy to fat-finger on a phone —
 * unlike every other action here, it goes through an explicit confirm step
 * rather than firing on the first tap.
 */
const CONFIRM_REQUIRED: OrderStatus[] = ["delivered"];

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
  /** Defaults to "lg" (manager desktop view); employee cards pass "default" to stay compact on mobile, "sm" for a single-action quick button on a dense card. */
  size?: "sm" | "default" | "lg";
  /** Renders only the given target statuses, if any match — e.g. `["collected", "delivered"]` for a compact "mark done" quick action without the full action list. */
  only?: OrderStatus[];
}

export function StatusActions({
  status,
  fulfillmentType,
  isOutsourced,
  pending,
  onChange,
  suppressDoneAction,
  size = "lg",
  only,
}: StatusActionsProps) {
  const [confirmTarget, setConfirmTarget] = useState<{ status: OrderStatus; label: string } | null>(null);

  let actions = getEmployeeNextActions(status, fulfillmentType, isOutsourced);
  if (suppressDoneAction && status === "in_progress") actions = actions.slice(0, -1);
  if (only) actions = actions.filter((a) => only.includes(a.status));
  if (actions.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.status}
            type="button"
            size={size}
            variant={SUCCESS_TARGETS.includes(action.status) ? "success" : "primary"}
            disabled={pending}
            onClick={() =>
              CONFIRM_REQUIRED.includes(action.status) ? setConfirmTarget(action) : onChange(action.status)
            }
            className={cn(
              size === "lg" ? "min-w-[168px]" : size === "default" ? "min-w-[140px]" : "min-w-0",
              "flex-1 sm:flex-none"
            )}
          >
            {pending && <Loader2 className="animate-spin" />}
            {action.label}
          </Button>
        ))}
      </div>

      <Dialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm delivery</DialogTitle>
            <DialogDescription>
              Mark this order as {confirmTarget?.label.toLowerCase()}? Only confirm once it&rsquo;s actually in the
              customer&rsquo;s hands.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="success"
              disabled={pending}
              onClick={() => {
                if (confirmTarget) onChange(confirmTarget.status);
                setConfirmTarget(null);
              }}
            >
              {pending && <Loader2 className="animate-spin" />}
              Confirm {confirmTarget?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
