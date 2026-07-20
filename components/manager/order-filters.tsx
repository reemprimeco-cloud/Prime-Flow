"use client";

import { useQueryState } from "nuqs";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDER_STATUS_LABELS, ORDER_STATUSES, ORDER_PRIORITY_LABELS } from "@/types/domain";
import type { EmployeeListItem } from "@/lib/actions/employees";

interface OrderFiltersProps {
  employees: Pick<EmployeeListItem, "id" | "fullName">[];
  /** Board view already splits orders by status — the status filter would just fight with that, so it's hidden there. */
  hideStatus?: boolean;
}

export function OrderFilters({ employees, hideStatus }: OrderFiltersProps) {
  const [search, setSearch] = useQueryState("q", { defaultValue: "", clearOnDefault: true });
  const [status, setStatus] = useQueryState("status", { defaultValue: "all", clearOnDefault: true });
  const [employeeId, setEmployeeId] = useQueryState("employee", { defaultValue: "all", clearOnDefault: true });
  const [priority, setPriority] = useQueryState("priority", { defaultValue: "all", clearOnDefault: true });
  const [deliveryDate, setDeliveryDate] = useQueryState("date", { defaultValue: "", clearOnDefault: true });

  const hasActiveFilters =
    search || status !== "all" || employeeId !== "all" || priority !== "all" || deliveryDate;

  const clearAll = () => {
    setSearch(null);
    setStatus(null);
    setEmployeeId(null);
    setPriority(null);
    setDeliveryDate(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value || null)}
          placeholder="Search order #, customer, phone, product…"
          className="pl-10"
        />
      </div>

      {!hideStatus && (
        <Select value={status} onValueChange={(v) => setStatus(v === "all" ? null : v)}>
          <SelectTrigger className="w-[170px]">
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
        <SelectTrigger className="w-[170px]">
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
        <SelectTrigger className="w-[140px]">
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
        className="w-[160px]"
      />

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5 text-muted-foreground">
          <X className="size-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
