import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import { format } from "date-fns";

import { requireAdmin } from "@/lib/auth/guards";
import { listMaterialRequests } from "@/lib/actions/material-requests";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MATERIAL_PRIORITY_LABELS, MATERIAL_REQUEST_STATUS_LABELS, MATERIAL_TYPE_LABELS } from "@/types/domain";

export const metadata: Metadata = {
  title: "Material Requests — Prime Production Board",
};

export default async function MaterialRequestsPage() {
  await requireAdmin();
  const requests = await listMaterialRequests();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Material Requests</h1>
        <p className="text-sm text-muted-foreground">
          {requests.filter((r) => r.status === "pending").length} pending · {requests.length} total
        </p>
      </div>

      {requests.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <PackageSearch className="size-6" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No material requests yet</p>
            <p className="text-sm text-muted-foreground">
              Requests submitted by employees from the floor will show up here in realtime.
            </p>
          </div>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-mono text-xs">{request.orderNumber ?? "—"}</TableCell>
                <TableCell>{MATERIAL_TYPE_LABELS[request.materialType]}</TableCell>
                <TableCell className="max-w-[240px] truncate">{request.description}</TableCell>
                <TableCell>{request.quantity}</TableCell>
                <TableCell>
                  <Badge variant={request.priority === "urgent" ? "destructive" : "muted"}>
                    {MATERIAL_PRIORITY_LABELS[request.priority]}
                  </Badge>
                </TableCell>
                <TableCell>{request.employeeName}</TableCell>
                <TableCell>
                  <Badge variant={request.status === "pending" ? "warning" : "muted"}>
                    {MATERIAL_REQUEST_STATUS_LABELS[request.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(request.createdAt), "MMM d, h:mm a")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
