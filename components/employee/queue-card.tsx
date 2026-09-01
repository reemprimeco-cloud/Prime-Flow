"use client";

import { Loader2, ShieldAlert, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountdownTimer } from "@/components/orders/countdown-timer";
import { cn } from "@/lib/utils";

import type { EmployeeJobItem } from "@/lib/actions/employee-jobs";

interface QueueCardProps {
  job: EmployeeJobItem;
  isNext: boolean;
  pending: boolean;
  onStart: () => void;
}

/**
 * Deliberately minimal — customer + product is the only thing a queued
 * (not-yet-started) job needs to convey at a glance; the full date/time
 * line and quantity were dropped in favor of the countdown pill alone,
 * which already carries the urgency signal that actually matters here.
 * JobCard (an *active* job) stays fully detailed — this is only for what's
 * still waiting in line.
 */
export function QueueCard({ job, isNext, pending, onStart }: QueueCardProps) {
  return (
    <Card className={cn("flex items-center gap-3 p-3", isNext && "border-secondary/50 bg-secondary/5")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {isNext && (
            <Badge variant="default" className="gap-1">
              <Sparkles className="size-3" />
              Up Next
            </Badge>
          )}
          <span className="font-mono text-xs font-bold text-secondary">{job.orderNumber}</span>
          {job.priority === "urgent" && <Badge variant="destructive">Urgent</Badge>}
        </div>
        <div className="truncate text-sm font-bold text-foreground">{job.customerName}</div>
        <div className="truncate text-xs text-muted-foreground">{job.product}</div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <CountdownTimer deliveryDate={job.deliveryDate} deliveryTime={job.deliveryTime} size="sm" />
        {job.approved ? (
          <Button type="button" size="sm" variant="primary" disabled={pending} onClick={onStart}>
            {pending && <Loader2 className="animate-spin" />}
            Start
          </Button>
        ) : (
          <span className="flex items-center gap-1 text-xs font-semibold text-warning-foreground">
            <ShieldAlert className="size-3 shrink-0" />
            Awaiting approval
          </span>
        )}
      </div>
    </Card>
  );
}
