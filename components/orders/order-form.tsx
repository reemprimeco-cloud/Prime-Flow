"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import { orderFormSchema, type OrderFormInput } from "@/lib/validation/order";
import { createOrder, deleteOrderFile, updateOrder, type OrderDetail } from "@/lib/actions/orders";
import type { EmployeeListItem } from "@/lib/actions/employees";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from "@/components/shared/file-upload";
import { DESIGN_FILE_ACCEPT, PRODUCT_IMAGE_ACCEPT } from "@/lib/files/constants";
import { ORDER_PRIORITY_LABELS } from "@/types/domain";

interface OrderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: OrderDetail | null;
  employees: Pick<EmployeeListItem, "id" | "fullName" | "role">[];
  onSaved: () => void;
}

// z.coerce.number() on `quantity` gives the schema a narrower output type
// (number) than input type (unknown, since it accepts the raw FormData
// string too) — RHF needs the input type for field values / defaultValues,
// and the output type for the validated onSubmit payload.
type OrderFormValues = z.input<typeof orderFormSchema>;

function defaultValues(order?: OrderDetail | null): OrderFormValues {
  if (!order) {
    return {
      customerName: "",
      customerMobile: "",
      preferredLanguage: "ar",
      whatsappEnabled: true,
      product: "",
      paper: "",
      paperSize: "",
      quantity: 1,
      finishing: "",
      priority: "normal",
      deliveryDate: "",
      deliveryTime: "",
      notes: "",
      employeeIds: [],
    };
  }
  return {
    customerName: order.customerName,
    customerMobile: order.customerMobile,
    preferredLanguage: order.preferredLanguage,
    whatsappEnabled: order.whatsappEnabled,
    product: order.product,
    paper: order.paper ?? "",
    paperSize: order.paperSize ?? "",
    quantity: order.quantity,
    finishing: order.finishing ?? "",
    priority: order.priority,
    deliveryDate: order.deliveryDate,
    deliveryTime: order.deliveryTime.slice(0, 5),
    notes: order.notes ?? "",
    employeeIds: order.assignedEmployees.map((e) => e.id),
  };
}

export function OrderForm({ open, onOpenChange, order, employees, onSaved }: OrderFormProps) {
  const isEdit = !!order;
  const [isPending, startTransition] = useTransition();
  const [productImages, setProductImages] = useState<File[]>([]);
  const [designFiles, setDesignFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState(order?.productImages ?? []);
  const [existingDesigns, setExistingDesigns] = useState(order?.designFiles ?? []);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OrderFormValues, unknown, OrderFormInput>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: defaultValues(order),
  });

  const employeeIds = watch("employeeIds") ?? [];

  // RHF only reads `defaultValues` on first mount — since this form is a
  // single long-lived instance reused for every order, we have to
  // explicitly re-sync whenever the `order` prop changes (new order opened
  // for edit, or cleared back to create-mode).
  useEffect(() => {
    reset(defaultValues(order));
    setExistingImages(order?.productImages ?? []);
    setExistingDesigns(order?.designFiles ?? []);
    setProductImages([]);
    setDesignFiles([]);
  }, [order, reset]);

  const removeExistingFile = (fileId: string, kind: "image" | "design") => {
    setRemovingId(fileId);
    startTransition(async () => {
      try {
        await deleteOrderFile(fileId);
        if (kind === "image") {
          setExistingImages((prev) => prev.filter((f) => f.id !== fileId));
        } else {
          setExistingDesigns((prev) => prev.filter((f) => f.id !== fileId));
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove file");
      } finally {
        setRemovingId(null);
      }
    });
  };

  const onSubmit = (values: OrderFormInput) => {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("customerName", values.customerName);
        formData.set("customerMobile", values.customerMobile);
        formData.set("preferredLanguage", values.preferredLanguage);
        formData.set("whatsappEnabled", String(values.whatsappEnabled));
        formData.set("product", values.product);
        formData.set("paper", values.paper ?? "");
        formData.set("paperSize", values.paperSize ?? "");
        formData.set("quantity", String(values.quantity));
        formData.set("finishing", values.finishing ?? "");
        formData.set("priority", values.priority);
        formData.set("deliveryDate", values.deliveryDate);
        formData.set("deliveryTime", values.deliveryTime);
        formData.set("notes", values.notes ?? "");
        values.employeeIds.forEach((id) => formData.append("employeeIds", id));
        productImages.forEach((file) => formData.append("productImages", file));
        designFiles.forEach((file) => formData.append("designFiles", file));

        if (isEdit) {
          await updateOrder(order.id, formData);
          toast.success(`Order ${order.orderNumber} updated`);
        } else {
          await createOrder(formData);
          toast.success("Order created");
        }

        onOpenChange(false);
        onSaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save order");
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{isEdit ? `Edit ${order.orderNumber}` : "New Order"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Update the order specifications and assignments." : "Create a new production job."}
          </SheetDescription>
        </SheetHeader>

        <form id="order-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <SheetBody className="flex flex-col gap-6">
            <section className="flex flex-col gap-4">
              <h3 className="text-sm font-bold text-muted-foreground">Customer</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Customer Name" error={errors.customerName?.message}>
                  <Input {...register("customerName")} aria-invalid={!!errors.customerName} />
                </Field>
                <Field label="Mobile Number" error={errors.customerMobile?.message}>
                  <Input {...register("customerMobile")} aria-invalid={!!errors.customerMobile} placeholder="+965 5000 1111" />
                </Field>
                <Field label="Preferred Language">
                  <Controller
                    control={control}
                    name="preferredLanguage"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ar">Arabic</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4">
                  <Label htmlFor="whatsappEnabled" className="text-sm">
                    WhatsApp Notifications
                  </Label>
                  <Controller
                    control={control}
                    name="whatsappEnabled"
                    render={({ field }) => (
                      <Switch id="whatsappEnabled" checked={field.value} onCheckedChange={field.onChange} />
                    )}
                  />
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-4">
              <h3 className="text-sm font-bold text-muted-foreground">Specifications</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Product" error={errors.product?.message}>
                  <Input {...register("product")} aria-invalid={!!errors.product} placeholder="Business Cards" />
                </Field>
                <Field label="Quantity" error={errors.quantity?.message}>
                  <Input type="number" min={1} {...register("quantity")} aria-invalid={!!errors.quantity} />
                </Field>
                <Field label="Paper">
                  <Input {...register("paper")} placeholder="300gsm Matte" />
                </Field>
                <Field label="Paper Size">
                  <Input {...register("paperSize")} placeholder="A6" />
                </Field>
                <Field label="Finishing" className="col-span-2">
                  <Input {...register("finishing")} placeholder="Lamination, rounded corners" />
                </Field>
              </div>
            </section>

            <section className="flex flex-col gap-4">
              <h3 className="text-sm font-bold text-muted-foreground">Delivery</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Delivery Date" error={errors.deliveryDate?.message}>
                  <Input type="date" {...register("deliveryDate")} aria-invalid={!!errors.deliveryDate} />
                </Field>
                <Field label="Delivery Time" error={errors.deliveryTime?.message}>
                  <Input type="time" {...register("deliveryTime")} aria-invalid={!!errors.deliveryTime} />
                </Field>
                <Field label="Priority" className="col-span-2">
                  <Controller
                    control={control}
                    name="priority"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ORDER_PRIORITY_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <Field label="Notes">
                <Textarea {...register("notes")} rows={3} placeholder="Production notes for the floor" />
              </Field>
            </section>

            <section className="flex flex-col gap-4">
              <h3 className="text-sm font-bold text-muted-foreground">Files</h3>
              <FileUpload
                label="Product Images"
                accept={PRODUCT_IMAGE_ACCEPT}
                files={productImages}
                onChange={setProductImages}
                existingFiles={existingImages}
                onRemoveExisting={(id) => removeExistingFile(id, "image")}
                removingId={removingId}
              />
              <FileUpload
                label="Design Files (PDF, AI, PSD, CDR, ZIP, images)"
                accept={DESIGN_FILE_ACCEPT}
                files={designFiles}
                onChange={setDesignFiles}
                existingFiles={existingDesigns}
                onRemoveExisting={(id) => removeExistingFile(id, "design")}
                removingId={removingId}
              />
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-bold text-muted-foreground">Assign Employees</h3>
              <div className="flex max-h-52 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-2 scrollbar-thin">
                {employees.length === 0 && (
                  <p className="px-2 py-3 text-sm text-muted-foreground">No active employees yet.</p>
                )}
                {employees.map((employee) => {
                  const checked = employeeIds.includes(employee.id);
                  return (
                    <label
                      key={employee.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          setValue(
                            "employeeIds",
                            value
                              ? [...employeeIds, employee.id]
                              : employeeIds.filter((id) => id !== employee.id)
                          );
                        }}
                      />
                      <span className="text-sm">{employee.fullName}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          </SheetBody>
        </form>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="order-form" variant="primary" disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            {isEdit ? "Save Changes" : "Create Order"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5">{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
