"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { editCustomerSchema } from "@/lib/validation/customer";
import { updateCustomerInfo, type CustomerListItem } from "@/lib/actions/customers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CustomerEditFormValues {
  customerName: string;
  customerMobile: string;
}

interface CustomerEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: CustomerListItem | null;
}

export function CustomerEditDialog({ open, onOpenChange, customer }: CustomerEditDialogProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerEditFormValues>({
    resolver: zodResolver(editCustomerSchema),
    defaultValues: { customerName: "", customerMobile: "" },
  });

  useEffect(() => {
    if (open && customer) {
      reset({ customerName: customer.customerName, customerMobile: customer.customerMobile });
    }
  }, [open, customer, reset]);

  const mutation = useMutation({
    mutationFn: async (values: CustomerEditFormValues) => {
      if (!customer) throw new Error("No customer selected");
      return updateCustomerInfo(customer.customerMobile, values);
    },
    onSuccess: ({ updated }) => {
      toast.success(`Updated ${updated} order${updated === 1 ? "" : "s"} for this customer`);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Something went wrong"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
          <DialogDescription>
            Updates the name and mobile number on every order from this customer — use this to fix a typo or
            merge a duplicate entry instead of it drifting into two separate customers.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="customerName">Name</Label>
            <Input id="customerName" aria-invalid={!!errors.customerName} {...register("customerName")} />
            {errors.customerName && <p className="text-sm text-destructive">{errors.customerName.message}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="customerMobile">Mobile Number</Label>
            <Input
              id="customerMobile"
              dir="ltr"
              aria-invalid={!!errors.customerMobile}
              {...register("customerMobile")}
            />
            {errors.customerMobile && <p className="text-sm text-destructive">{errors.customerMobile.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
