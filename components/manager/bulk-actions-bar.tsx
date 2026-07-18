"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Archive, Bell, Calendar, Flag, Loader2, Users, X } from "lucide-react";

import {
  bulkArchiveCompleted,
  bulkAssignEmployees,
  bulkChangePriority,
  bulkMoveDeliveryDate,
  bulkSendNotifications,
  type BulkResult,
} from "@/lib/actions/bulk";
import type { EmployeeListItem } from "@/lib/actions/employees";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ORDER_PRIORITY_LABELS } from "@/types/domain";
import type { OrderPriority } from "@/types/database.types";

type BulkMode = "assign" | "priority" | "date" | null;

interface BulkActionsBarProps {
  selectedIds: string[];
  employees: Pick<EmployeeListItem, "id" | "fullName">[];
  onClear: () => void;
  onDone: () => void;
}

function reportResult(action: string, result: BulkResult) {
  if (result.skipped > 0) {
    toast.success(`${action}: ${result.succeeded} succeeded, ${result.skipped} skipped`);
  } else {
    toast.success(`${action}: ${result.succeeded} order${result.succeeded === 1 ? "" : "s"} updated`);
  }
}

export function BulkActionsBar({ selectedIds, employees, onClear, onDone }: BulkActionsBarProps) {
  const [mode, setMode] = useState<BulkMode>(null);
  const [isPending, setIsPending] = useState(false);
  const [priority, setPriority] = useState<OrderPriority>("urgent");
  const [newDate, setNewDate] = useState("");
  const [pickedEmployees, setPickedEmployees] = useState<string[]>([]);

  const run = (label: string, action: () => Promise<BulkResult>) => {
    setIsPending(true);
    action()
      .then((result) => {
        reportResult(label, result);
        setMode(null);
        onDone();
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : `Failed to ${label.toLowerCase()}`))
      .finally(() => setIsPending(false));
  };

  const handleArchive = () => run("Archive", () => bulkArchiveCompleted(selectedIds));
  const handleNotify = () => run("Bulk notification", () => bulkSendNotifications(selectedIds));
  const handleAssign = () => run("Bulk assign", () => bulkAssignEmployees(selectedIds, pickedEmployees));
  const handlePriority = () => run("Priority change", () => bulkChangePriority(selectedIds, priority));
  const handleDate = () => run("Delivery date change", () => bulkMoveDeliveryDate(selectedIds, newDate));

  if (selectedIds.length === 0) return null;

  return (
    <>
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-secondary/40 bg-secondary/10 px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{selectedIds.length} selected</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setMode("assign")}>
            <Users className="size-3.5" /> Assign
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setMode("priority")}>
            <Flag className="size-3.5" /> Priority
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setMode("date")}>
            <Calendar className="size-3.5" /> Move Date
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleArchive} disabled={isPending}>
            <Archive className="size-3.5" /> Archive
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleNotify} disabled={isPending}>
            <Bell className="size-3.5" /> Notify
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <Dialog open={mode === "assign"} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bulk Assign</DialogTitle>
            <DialogDescription>Add employees to {selectedIds.length} selected orders.</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-52 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-2 scrollbar-thin">
            {employees.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40">
                <Checkbox
                  checked={pickedEmployees.includes(e.id)}
                  onCheckedChange={(v) =>
                    setPickedEmployees((prev) => (v ? [...prev, e.id] : prev.filter((id) => id !== e.id)))
                  }
                />
                <span className="text-sm">{e.fullName}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAssign} disabled={isPending || pickedEmployees.length === 0}>
              {isPending && <Loader2 className="animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "priority"} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Priority</DialogTitle>
            <DialogDescription>Set priority for {selectedIds.length} selected orders.</DialogDescription>
          </DialogHeader>
          <Select value={priority} onValueChange={(v) => setPriority(v as OrderPriority)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ORDER_PRIORITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handlePriority} disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "date"} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move Delivery Date</DialogTitle>
            <DialogDescription>Reschedule {selectedIds.length} selected orders to a new date.</DialogDescription>
          </DialogHeader>
          <Label className="mb-1.5">New Delivery Date</Label>
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleDate} disabled={isPending || !newDate}>
              {isPending && <Loader2 className="animate-spin" />}
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
