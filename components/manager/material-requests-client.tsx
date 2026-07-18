"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, PackageSearch, X } from "lucide-react";
import { format } from "date-fns";

import {
  approveMaterialRequest,
  listMaterialRequests,
  rejectMaterialRequest,
  type MaterialRequestListItem,
} from "@/lib/actions/material-requests";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { CHANNELS } from "@/lib/realtime/constants";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MATERIAL_PRIORITY_LABELS, MATERIAL_REQUEST_STATUS_LABELS, MATERIAL_TYPE_LABELS } from "@/types/domain";

export function MaterialRequestsClient({ initialRequests }: { initialRequests: MaterialRequestListItem[] }) {
  const queryClient = useQueryClient();
  const [actioningId, setActioningId] = useState<string | null>(null);

  const requestsQuery = useQuery({
    queryKey: ["material-requests"],
    queryFn: () => listMaterialRequests(),
    initialData: initialRequests,
  });

  useRealtimeChannel(CHANNELS.materialRequests, () => {
    queryClient.invalidateQueries({ queryKey: ["material-requests"] });
  });

  const requests = requestsQuery.data ?? initialRequests;

  const handleApprove = (request: MaterialRequestListItem) => {
    setActioningId(request.id);
    approveMaterialRequest(request.id)
      .then(() => {
        toast.success(`Approved material request for ${request.orderNumber ?? "general stock"}`);
        queryClient.invalidateQueries({ queryKey: ["material-requests"] });
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to approve request"))
      .finally(() => setActioningId(null));
  };

  const handleReject = (request: MaterialRequestListItem) => {
    setActioningId(request.id);
    rejectMaterialRequest(request.id)
      .then(() => {
        toast.success(`Rejected material request for ${request.orderNumber ?? "general stock"}`);
        queryClient.invalidateQueries({ queryKey: ["material-requests"] });
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to reject request"))
      .finally(() => setActioningId(null));
  };

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
              <TableHead className="w-32" />
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
                  <Badge variant={request.status === "pending" ? "warning" : request.status === "approved" || request.status === "fulfilled" ? "success" : "muted"}>
                    {MATERIAL_REQUEST_STATUS_LABELS[request.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(request.createdAt), "MMM d, h:mm a")}
                </TableCell>
                <TableCell>
                  {request.status === "pending" && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="success"
                        size="sm"
                        disabled={actioningId === request.id}
                        onClick={() => handleApprove(request)}
                      >
                        {actioningId === request.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={actioningId === request.id}
                        onClick={() => handleReject(request)}
                      >
                        <X className="size-3.5" />
                        Reject
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
