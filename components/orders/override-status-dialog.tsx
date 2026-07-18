"use client";

import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { overrideOrderStatus } from "@/lib/actions/orders";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/types/domain";
import type { OrderStatus } from "@/types/database.types";

interface OverrideStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  currentStatus: OrderStatus;
  onOverridden: () => void;
}

export function OverrideStatusDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  currentStatus,
  onOverridden,
}: OverrideStatusDialogProps) {
  const [status, setStatus] = useState<OrderStatus>(currentStatus);
  const [reason, setReason] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleConfirm = () => {
    if (!reason.trim()) {
      toast.error("Enter a reason for this override.");
      return;
    }
    setIsPending(true);
    overrideOrderStatus(orderId, status, reason.trim())
      .then(() => {
        toast.success(`${orderNumber} overridden to ${ORDER_STATUS_LABELS[status]}`);
        onOpenChange(false);
        setReason("");
        onOverridden();
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to override status"))
      .finally(() => setIsPending(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
              <ShieldAlert className="size-5" />
            </div>
            <DialogTitle>Override Status</DialogTitle>
          </div>
          <DialogDescription>
            Sets {orderNumber}&apos;s status directly, skipping the normal workflow rules. Every override is recorded
            in the audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label className="mb-1.5">New Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ORDER_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5">Reason (required)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this override necessary?"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="warning" onClick={handleConfirm} disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            Override Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
