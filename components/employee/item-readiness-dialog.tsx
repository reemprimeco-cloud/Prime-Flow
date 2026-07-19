"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

import { toggleJobItemReady, type EmployeeJobItem } from "@/lib/actions/employee-jobs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { PRIMARY_ITEM_ID } from "@/types/domain";

interface ItemReadinessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: EmployeeJobItem | null;
}

export function ItemReadinessDialog({ open, onOpenChange, job }: ItemReadinessDialogProps) {
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (!job) return null;

  const rows = [
    {
      id: PRIMARY_ITEM_ID,
      product: job.product,
      paper: job.paper,
      paperSize: job.paperSize,
      quantity: job.quantity,
      finishing: job.finishing,
      isReady: job.itemReady,
    },
    ...job.additionalItems,
  ];
  const remainingCount = rows.filter((r) => !r.isReady).length;

  const handleToggle = (itemId: string, next: boolean) => {
    const willCompleteAll = next && remainingCount === 1 && !rows.find((r) => r.id === itemId)?.isReady;
    setPendingId(itemId);
    toggleJobItemReady(job.id, itemId, next)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["my-jobs"] });
        if (willCompleteAll) {
          toast.success(`${job.orderNumber} — all items ready, order moved to the next stage`);
        }
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to update item"))
      .finally(() => setPendingId(null));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Items — {job.orderNumber}</DialogTitle>
          <DialogDescription>
            {remainingCount === 0
              ? "All items are ready."
              : `Check off each item as it's ready. ${remainingCount} of ${rows.length} left.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <label
              key={row.id}
              className="flex items-start gap-3 rounded-xl border border-border px-4 py-3 hover:border-secondary/50"
            >
              <Checkbox
                checked={row.isReady}
                disabled={pendingId === row.id}
                onCheckedChange={(checked) => handleToggle(row.id, checked === true)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-foreground">
                  Item {index + 1}: {row.product}
                </div>
                <div className="text-xs text-muted-foreground">
                  {row.paper || "—"} · {row.paperSize || "—"} · Qty {row.quantity}
                  {row.finishing ? ` · ${row.finishing}` : ""}
                </div>
              </div>
              {row.isReady && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
            </label>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
