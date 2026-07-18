"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import { addJobNote } from "@/lib/actions/employee-jobs";
import { orderNoteSchema } from "@/lib/validation/material-request";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type NoteInput = z.infer<typeof orderNoteSchema>;

interface AddNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  orderNumber?: string;
}

export function AddNoteDialog({ open, onOpenChange, orderId, orderNumber }: AddNoteDialogProps) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NoteInput>({
    resolver: zodResolver(orderNoteSchema),
    defaultValues: { note: "" },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const onSubmit = (values: NoteInput) => {
    if (!orderId) return;
    startTransition(async () => {
      try {
        await addJobNote(orderId, values.note);
        toast.success("Note added");
        handleOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add note");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Note{orderNumber ? ` — ${orderNumber}` : ""}</DialogTitle>
          <DialogDescription>Leave a note on the production floor for this order.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
          <Textarea rows={4} autoFocus {...register("note")} aria-invalid={!!errors.note} placeholder="e.g. Waiting on customer to confirm color" />
          {errors.note && <p className="text-xs text-destructive">{errors.note.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              Save Note
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
