"use client";

import { useState } from "react";
import { Download, Loader2, ShieldAlert, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountdownTimer } from "@/components/orders/countdown-timer";
import { DesignApprovalControl } from "@/components/employee/design-approval-control";
import { cn } from "@/lib/utils";

import type { EmployeeJobItem } from "@/lib/actions/employee-jobs";

interface QueueCardProps {
  job: EmployeeJobItem;
  isNext: boolean;
  pending: boolean;
  onStart: () => void;
  /** Whether the *signed-in* employee (not this specific job) has permission to send the customer a design-approval link. */
  canRequestDesignApproval: boolean;
  designApprovalPending: boolean;
  onRequestApproval: () => void;
}

/**
 * Deliberately minimal — customer + product is the only thing a queued
 * (not-yet-started) job needs to convey at a glance; the full date/time
 * line and quantity were dropped in favor of the countdown pill alone,
 * which already carries the urgency signal that actually matters here.
 * JobCard (an *active* job) stays fully detailed — this is only for what's
 * still waiting in line.
 *
 * The uploaded files are the one exception: they used to only appear once
 * the job moved to "My Active Jobs" (i.e. after Start was already clicked),
 * which meant the employee started production blind. They're surfaced here
 * too now, and Start stays disabled until at least one file has been opened
 * — so the file is checked before the job starts, not after.
 */
export function QueueCard({
  job,
  isNext,
  pending,
  onStart,
  canRequestDesignApproval,
  designApprovalPending,
  onRequestApproval,
}: QueueCardProps) {
  const [fileOpened, setFileOpened] = useState(false);
  const hasFiles = job.productImages.length > 0 || job.designFiles.length > 0;
  const canStart = !hasFiles || fileOpened;

  return (
    <Card className={cn("flex flex-col gap-3 p-3", isNext && "border-secondary/50 bg-secondary/5")}>
      <div className="flex items-center gap-3">
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
            <Button type="button" size="sm" variant="primary" disabled={pending || !canStart} onClick={onStart}>
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
      </div>

      {hasFiles && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
          <div className="flex flex-wrap gap-2">
            {job.productImages.map((file) => (
              <a
                key={file.id}
                href={file.url ?? undefined}
                download={file.fileName}
                target="_blank"
                rel="noreferrer"
                onClick={() => setFileOpened(true)}
                className="flex items-center gap-1.5 rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-secondary/15"
              >
                <Download className="size-3.5 shrink-0" />
                {file.fileName}
              </a>
            ))}
            {job.designFiles.map((file) => (
              <a
                key={file.id}
                href={file.url ?? undefined}
                download={file.fileName}
                target="_blank"
                rel="noreferrer"
                onClick={() => setFileOpened(true)}
                className="flex items-center gap-1.5 rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-secondary/15"
              >
                <Download className="size-3.5 shrink-0" />
                {file.fileName}
              </a>
            ))}
          </div>
          {!fileOpened && (
            <p className="text-xs font-medium text-warning-foreground">Open the file above before starting.</p>
          )}
        </div>
      )}

      {canRequestDesignApproval && (
        <div className="border-t border-border pt-2.5">
          <DesignApprovalControl job={job} pending={designApprovalPending} onRequest={onRequestApproval} />
        </div>
      )}
    </Card>
  );
}
