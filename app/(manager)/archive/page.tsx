import type { Metadata } from "next";
import { Archive as ArchiveIcon } from "lucide-react";
import { format } from "date-fns";

import { requireAdmin } from "@/lib/auth/guards";
import { listArchivedOrders } from "@/lib/actions/archive";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Archive — Prime Production Board",
};

export default async function ArchivePage() {
  await requireAdmin();
  const orders = await listArchivedOrders();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Archive</h1>
        <p className="text-sm text-muted-foreground">Completed orders from previous months</p>
      </div>

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
            {orders.map((order) => (
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
