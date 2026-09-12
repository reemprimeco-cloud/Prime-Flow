"use client";

import { Loader2, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DESIGN_APPROVAL_STATUS_LABELS } from "@/types/domain";
import type { EmployeeJobItem } from "@/lib/actions/employee-jobs";

interface DesignApprovalControlProps {
  job: EmployeeJobItem;
  pending: boolean;
  onRequest: () => void;
}

/**
 * "Send for Approval" for employees granted the permission (see
 * employees.can_request_design_approval) — same action and gating as the
 * admin dashboard's Design Approval section (order-detail-drawer.tsx), just
 * surfaced here for job-card.tsx and queue-card.tsx instead.
 */
export function DesignApprovalControl({ job, pending, onRequest }: DesignApprovalControlProps) {
  const hasFiles = job.productImages.length > 0 || job.designFiles.length > 0;

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/20 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Design Approval
          </span>
          <Badge
            variant={
              job.designApprovalStatus === "approved"
                ? "success"
                : job.designApprovalStatus === "changes_requested"
                  ? "destructive"
                  : job.designApprovalStatus === "pending"
                    ? "warning"
                    : "muted"
            }
          >
            {DESIGN_APPROVAL_STATUS_LABELS[job.designApprovalStatus]}
          </Badge>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasFiles || pending}
          onClick={onRequest}
          className="gap-1.5"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          {job.designApprovalStatus === "not_sent" ? "Send for Approval" : "Resend Link"}
        </Button>
      </div>
      {!hasFiles && (
        <p className="text-xs text-muted-foreground">
          Upload a product image or design file first — the customer needs something to review.
        </p>
      )}
      {job.designApprovalStatus === "changes_requested" && job.designApprovalNote && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground">
          &ldquo;{job.designApprovalNote}&rdquo;
        </p>
      )}
      {job.designApprovalStatus === "pending" && (
        <p className="text-xs text-muted-foreground">Start Production is blocked until the customer responds.</p>
      )}
    </div>
  );
}
