"use client";

import { useMemo, useState } from "react";
import { Archive as ArchiveIcon, Search } from "lucide-react";
import { format } from "date-fns";

import type { ArchivedOrderItem } from "@/lib/actions/archive";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function ArchiveClient({ orders }: { orders: ArchivedOrderItem[] }) {
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");

  const months = useMemo(() => {
    const set = new Set(orders.map((o) => (o.completedAt ? format(new Date(o.completedAt), "yyyy-MM") : "unknown")));
    return [...set].sort().reverse();
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (monthFilter !== "all") {
        const key = o.completedAt ? format(new Date(o.completedAt), "yyyy-MM") : "unknown";
        if (key !== monthFilter) return false;
      }
      if (search.trim()) {
        const term = search.trim().toLowerCase();
        const haystack = `${o.orderNumber} ${o.customerName} ${o.product}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [orders, search, monthFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Archive</h1>
        <p className="text-sm text-muted-foreground">Completed orders from previous months · {orders.length} total</p>
      </div>

      {orders.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order #, customer, product..."
              className="pl-9"
            />
          </div>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {m === "unknown" ? "Unknown" : format(new Date(`${m}-01`), "MMMM yyyy")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {orders.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <ArchiveIcon className="size-6" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Nothing archived yet</p>
            <p className="text-sm text-muted-foreground">
              Completed orders move here automatically at the start of each month.
            </p>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">No archived orders match your filters.</p>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Delivery Date</TableHead>
              <TableHead>Completed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-mono text-xs">{order.orderNumber}</TableCell>
                <TableCell>{order.customerName}</TableCell>
                <TableCell>{order.product}</TableCell>
                <TableCell>{format(new Date(order.deliveryDate), "MMM d, yyyy")}</TableCell>
                <TableCell className="text-muted-foreground">
                  {order.completedAt ? format(new Date(order.completedAt), "MMM d, yyyy") : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
