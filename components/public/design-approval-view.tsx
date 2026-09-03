"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { CheckCircle2, ImageIcon, Loader2, MessageSquareWarning, ThumbsUp, ZoomIn } from "lucide-react";
import { toast } from "sonner";

import { respondToDesignApproval, type PublicDesignApproval } from "@/lib/actions/design-approval";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function DesignApprovalView({ token, approval }: { token: string; approval: PublicDesignApproval }) {
  const [status, setStatus] = useState(approval.status);
  const [note, setNote] = useState(approval.note ?? "");
  const [showChangesForm, setShowChangesForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const files = [...approval.productImages, ...approval.designFiles];

  const submit = (decision: "approved" | "changes_requested") => {
    if (decision === "changes_requested" && !note.trim()) {
      toast.error("Please describe what needs to change.");
      return;
    }
    startTransition(async () => {
      try {
        await respondToDesignApproval(token, decision, decision === "changes_requested" ? note : undefined);
        setStatus(decision);
        toast.success(decision === "approved" ? "Thanks for approving!" : "We got your notes — thank you.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      }
    });
  };

  return (
    <Card className="flex flex-col gap-5 p-6 shadow-xl">
      <div>
        <p className="font-mono text-sm font-bold text-secondary">{approval.orderNumber}</p>
        <h2 className="text-lg font-bold text-foreground">{approval.product}</h2>
        <p className="text-sm text-muted-foreground">Hi {approval.customerName}, please review your design below.</p>
      </div>

      {files.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          <ImageIcon className="size-6" />
          No files uploaded yet.
        </div>
      ) : (
        <div className={files.length === 1 ? "flex flex-col gap-2" : "grid grid-cols-2 gap-4"}>
          {files.map((file) => (
            <a
              key={file.id}
              href={file.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col gap-1.5"
            >
              <span
                className={
                  files.length === 1
                    ? "relative block aspect-[4/5] w-full overflow-hidden rounded-xl border border-border bg-muted/40"
                    : "relative block aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted/40"
                }
              >
                {file.url ? (
                  <Image
                    src={file.url}
                    alt={file.fileName}
                    fill
                    sizes={files.length === 1 ? "(max-width: 640px) 100vw, 480px" : "240px"}
                    className="object-cover transition-transform group-active:scale-105"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="size-5" />
                  </span>
                )}
              </span>
              <span className="flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
                <ZoomIn className="size-3.5" />
                اضغط لتكبير الصورة
              </span>
            </a>
          ))}
        </div>
      )}

      {status === "approved" ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-success/10 py-6 text-center text-success">
          <CheckCircle2 className="size-8" />
          <p className="font-semibold">You approved this design.</p>
          <p className="text-sm text-muted-foreground">We&rsquo;ll start production shortly.</p>
        </div>
      ) : status === "changes_requested" ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-warning/10 py-6 text-center text-warning-foreground">
          <MessageSquareWarning className="size-8" />
          <p className="font-semibold">Your changes were sent to us.</p>
          <p className="text-sm text-muted-foreground">We&rsquo;ll follow up once it&rsquo;s updated.</p>
        </div>
      ) : showChangesForm ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="design-note">What needs to change?</Label>
          <Textarea
            id="design-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="e.g. Please make the logo bigger and fix the spelling of..."
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setShowChangesForm(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="button" variant="warning" disabled={isPending} onClick={() => submit("changes_requested")} className="flex-1 gap-2">
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Send Changes
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => setShowChangesForm(true)}
            className="flex-1 gap-2"
          >
            <MessageSquareWarning className="size-4" />
            Request Changes
          </Button>
          <Button type="button" variant="success" disabled={isPending} onClick={() => submit("approved")} className="flex-1 gap-2">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <ThumbsUp className="size-4" />}
            Approve Design
          </Button>
        </div>
      )}
    </Card>
  );
}
