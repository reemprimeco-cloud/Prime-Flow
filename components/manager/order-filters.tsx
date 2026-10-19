"use client";

import { useState, type ReactNode } from "react";
import { useQueryState } from "nuqs";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDER_STATUS_LABELS, ORDER_STATUSES, ORDER_PRIORITY_LABELS } from "@/types/domain";
import type { EmployeeListItem } from "@/lib/actions/employees";

interface OrderFiltersProps {
  employees: Pick<EmployeeListItem, "id" | "fullName">[];
  /** Board view already splits orders by status — the status filter would just fight with that, so it's hidden there. */
  hideStatus?: boolean;
  /** Rendered at the end of the row (the view toggle) — shares the phone's second row with "Filters". */
  trailing?: ReactNode;
}

export function OrderFilters({ employees, hideStatus, trailing }: OrderFiltersProps) {
  const [search, setSearch] = useQueryState("q", { defaultValue: "", clearOnDefault: true });
  const [status, setStatus] = useQueryState("status", { defaultValue: "all", clearOnDefault: true });
  const [employeeId, setEmployeeId] = useQueryState("employee", { defaultValue: "all", clearOnDefault: true });
  const [priority, setPriority] = useQueryState("priority", { defaultValue: "all", clearOnDefault: true });
  const [deliveryDate, setDeliveryDate] = useQueryState("date", { defaultValue: "", clearOnDefault: true });

  const hasActiveFilters =
    search || status !== "all" || employeeId !== "all" || priority !== "all" || deliveryDate;
  /** Filters beyond search, counted for the phone's collapsed "Filters" button. */
  const refinementCount = [!hideStatus && status !== "all", employeeId !== "all", priority !== "all", !!deliveryDate].filter(Boolean).length;
  // Phones show search + one "Filters" button; the dropdowns open below it.
  // From `sm` up they're always inline, exactly as before.
  const [showRefinements, setShowRefinements] = useState(false);

  const clearAll = () => {
    setSearch(null);
    setStatus(null);
    setEmployeeId(null);
    setPriority(null);
    setDeliveryDate(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[220px] flex-1 basis-full lg:basis-0">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value || null)}
          placeholder="Search order #, customer, phone, product…"
          className="pl-10"
        />
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => setShowRefinements((v) => !v)}
        aria-expanded={showRefinements}
        aria-controls="order-refinements"
        className="sm:hidden"
      >
        <SlidersHorizontal />
        Filters
        {refinementCount > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground tabular-nums">
            {refinementCount}
          </span>
        )}
      </Button>

      <div
        id="order-refinements"
        className={showRefinements ? "flex w-full flex-wrap gap-2.5 sm:contents" : "hidden sm:contents"}
      >
        {!hideStatus && (
          <Select value={status} onValueChange={(v) => setStatus(v === "all" ? null : v)}>
            <SelectTrigger className="min-w-[140px] flex-1 sm:w-[170px] sm:flex-none">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {ORDER_STATUSES.filter((s) => s !== "completed").map((s) => (
                <SelectItem key={s} value={s}>
                  {ORDER_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={employeeId} onValueChange={(v) => setEmployeeId(v === "all" ? null : v)}>
          <SelectTrigger className="min-w-[140px] flex-1 sm:w-[170px] sm:flex-none">
            <SelectValue placeholder="Employee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={(v) => setPriority(v === "all" ? null : v)}>
          <SelectTrigger className="min-w-[140px] flex-1 sm:w-[140px] sm:flex-none">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {Object.entries(ORDER_PRIORITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={deliveryDate}
          onChange={(e) => setDeliveryDate(e.target.value || null)}
          className="min-w-[140px] flex-1 sm:w-[160px] sm:flex-none"
        />
      </div>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5 text-muted-foreground">
          <X className="size-3.5" />
          Clear
        </Button>
      )}

      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  );
}
