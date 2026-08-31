"use client";

import { Truck, User } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { OrderDeliveryProvider } from "@/types/database.types";

interface DeliveryProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (provider: OrderDeliveryProvider) => void;
}

/**
 * The "who's actually delivering this" decision, asked at the moment an
 * order goes ready_delivery — not earlier at order-creation time, since
 * that's too soon to know and the answer can genuinely vary order to order.
 * Triggered from both the manual "Ready for Delivery" button
 * (components/orders/status-actions.tsx) and the last-item checkbox on a
 * multi-item order (components/employee/item-readiness-dialog.tsx), which
 * auto-advances the same transition with no button click to hang a prompt
 * off of otherwise.
 */
export function DeliveryProviderDialog({ open, onOpenChange, onChoose }: DeliveryProviderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who&rsquo;s delivering this?</DialogTitle>
          <DialogDescription>Choose how this order gets to the customer.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-1 py-4 text-left"
            onClick={() => onChoose("internal")}
          >
            <span className="flex items-center gap-2 font-semibold">
              <User className="size-4" />
              Internal
            </span>
            <span className="text-xs font-normal text-muted-foreground">Delivery-role staff (e.g. Naresh)</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-1 py-4 text-left"
            onClick={() => onChoose("armada")}
          >
            <span className="flex items-center gap-2 font-semibold">
              <Truck className="size-4" />
              Armada
            </span>
            <span className="text-xs font-normal text-muted-foreground">Dispatched to Armada&rsquo;s courier API</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
