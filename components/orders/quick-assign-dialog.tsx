"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setOrderAssignments } from "@/lib/actions/orders";
import type { OrderListItem } from "@/lib/actions/orders";
import type { EmployeeListItem } from "@/lib/actions/employees";

interface QuickAssignDialogProps {
  order: OrderListItem | null;
  employees: Pick<EmployeeListItem, "id" | "fullName" | "active">[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * The "Assign" quick action from a dashboard card: tick who works the order
 * and save, without opening the full edit form. The tick order is the
 * hand-off order (same rule as the form's "Assign Employees" list).
 */
export function QuickAssignDialog({ order, employees, onOpenChange, onSaved }: QuickAssignDialogProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  // Re-seed from the card each time a different order is opened.
  useEffect(() => {
    setPicked(order ? order.assignedEmployees.map((e) => e.id) : []);
  }, [order]);

  const active = employees.filter((e) => e.active);

  const handleSave = () => {
    if (!order) return;
    startTransition(async () => {
      try {
        await setOrderAssignments(order.id, picked);
        toast.success(picked.length === 0 ? `${order.orderNumber} unassigned` : `${order.orderNumber} assigned`);
        onSaved();
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to assign");
      }
    });
  };

  return (
    <Dialog open={!!order} onOpenChange={(open) => !isPending && onOpenChange(open)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign {order?.orderNumber}</DialogTitle>
          <DialogDescription>
            {order?.product}
            {order && order.assignedEmployees.length > 0 ? " · tick order = hand-off order" : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-2 scrollbar-thin">
          {active.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No active employees yet.</p>}
          {active.map((employee) => {
            const index = picked.indexOf(employee.id);
            return (
              <label key={employee.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40">
                <Checkbox
                  checked={index !== -1}
                  disabled={isPending}
                  onCheckedChange={(value) =>
                    setPicked((prev) => (value ? [...prev, employee.id] : prev.filter((id) => id !== employee.id)))
                  }
                />
                <span className="flex-1 text-sm">{employee.fullName}</span>
                {index !== -1 && picked.length > 1 && (
                  <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
                )}
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
