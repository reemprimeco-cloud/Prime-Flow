"use client";

import { Loader2, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountdownTimer } from "@/components/orders/countdown-timer";
import { formatDeliveryTime } from "@/lib/utils/countdown";

import type { EmployeeJobItem } from "@/lib/actions/employee-jobs";

interface QueueCardProps {
  job: EmployeeJobItem;
  isNext: boolean;
  pending: boolean;
  onStart: () => void;
}

export function QueueCard({ job, isNext, pending, onStart }: QueueCardProps) {
  return (
    <Card
      className={
        "flex flex-wrap items-center gap-4 p-4 " + (isNext ? "border-secondary/50 bg-secondary/5" : "")
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {isNext && (
            <Badge variant="default" className="gap-1">
              <Sparkles className="size-3" />
              Up Next
            </Badge>
          )}
          <span className="font-mono text-sm font-bold text-secondary">{job.orderNumber}</span>
          {job.priority === "urgent" && <Badge variant="destructive">Urgent</Badge>}
        </div>
        <div className="mt-1 truncate font-semibold">{job.customerName}</div>
        <div className="truncate text-sm text-muted-foreground">
          {job.product} · {job.quantity} pcs
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-bold">
          {format(parseISO(job.deliveryDate), "MMM d")} · {formatDeliveryTime(job.deliveryTime)}
        </span>
        <CountdownTimer deliveryDate={job.deliveryDate} deliveryTime={job.deliveryTime} />
      </div>

      <Button type="button" size="lg" variant="primary" disabled={pending} onClick={onStart}>
        {pending && <Loader2 className="animate-spin" />}
        Start Production
      </Button>
    </Card>
  );
}
