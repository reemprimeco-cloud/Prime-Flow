"use client";

import { useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { submitMaterialRequestForJob } from "@/lib/actions/employee-jobs";
import { materialRequestSchema, type MaterialRequestInput } from "@/lib/validation/material-request";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MATERIAL_PRIORITY_LABELS, MATERIAL_TYPE_LABELS } from "@/types/domain";

interface RequestMaterialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  orderNumber?: string;
}

const DEFAULT_VALUES: MaterialRequestInput = {
  materialType: "paper",
  description: "",
  quantity: "",
  priority: "normal",
};

export function RequestMaterialDialog({ open, onOpenChange, orderId, orderNumber }: RequestMaterialDialogProps) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<MaterialRequestInput>({
    resolver: zodResolver(materialRequestSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) reset(DEFAULT_VALUES);
    onOpenChange(next);
  };

  const onSubmit = (values: MaterialRequestInput) => {
    if (!orderId) return;
    startTransition(async () => {
      try {
        await submitMaterialRequestForJob(orderId, values);
        toast.success("Material request sent to the manager");
        handleOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to submit request");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Material{orderNumber ? ` — ${orderNumber}` : ""}</DialogTitle>
          <DialogDescription>Let the manager know what you need to keep production moving.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div>
            <Label className="mb-1.5">Material Type</Label>
            <Controller
              control={control}
              name="materialType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MATERIAL_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div>
            <Label className="mb-1.5">Description</Label>
            <Textarea rows={3} {...register("description")} aria-invalid={!!errors.description} placeholder="What exactly do you need?" />
            {errors.description && <p className="mt-1 text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5">Quantity</Label>
              <Input {...register("quantity")} aria-invalid={!!errors.quantity} placeholder="e.g. 2 reams" />
              {errors.quantity && <p className="mt-1 text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
            <div>
              <Label className="mb-1.5">Priority</Label>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MATERIAL_PRIORITY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
