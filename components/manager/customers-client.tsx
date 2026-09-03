"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Pencil, Users } from "lucide-react";

import { listCustomers, type CustomerListItem } from "@/lib/actions/customers";
import { CustomerEditDialog } from "@/components/manager/customer-edit-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function CustomersClient({ initialCustomers }: { initialCustomers: CustomerListItem[] }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CustomerListItem | null>(null);

  const query = useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers(),
    initialData: initialCustomers,
  });
  const customers = query.data ?? initialCustomers;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((c) => `${c.customerName} ${c.customerMobile}`.toLowerCase().includes(term));
  }, [customers, search]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {customers.length} — derived from order history, not a separate customer database.
          Fix a name or mobile number here to apply it across all of that customer&apos;s orders at once.
        </p>
      </div>

      <Input
        placeholder="Search name or mobile…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Users className="size-6" />
          </div>
          <p className="font-semibold text-foreground">
            {customers.length === 0 ? "No customers yet" : "No customers match this search"}
          </p>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Last Order</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((customer) => (
              <TableRow key={customer.customerMobile}>
                <TableCell className="font-medium text-foreground">{customer.customerName}</TableCell>
                <TableCell className="font-mono text-xs" dir="ltr">
                  {customer.customerMobile}
                </TableCell>
                <TableCell>{customer.orderCount}</TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(customer.lastOrderAt), "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    aria-label={`Edit ${customer.customerName}`}
                    onClick={() => setEditing(customer)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CustomerEditDialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)} customer={editing} />
    </div>
  );
}
