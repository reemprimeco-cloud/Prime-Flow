"use client";

import { useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Plus, X } from "lucide-react";
import type { z } from "zod";

import { orderRequestSchema, type OrderRequestInput } from "@/lib/validation/order-request";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from "@/components/shared/file-upload";
import { DESIGN_FILE_ACCEPT, PRODUCT_IMAGE_ACCEPT } from "@/lib/files/constants";
import { ORDER_FULFILLMENT_TYPE_LABELS } from "@/types/domain";

// z.coerce.number() on `quantity` gives the schema a narrower output type
// than input type — RHF needs the input type for field values/defaultValues
// and the output type for the validated onSubmit payload (same pattern as
// components/orders/order-form.tsx).
type OrderRequestValues = z.input<typeof orderRequestSchema>;

const emptyValues: OrderRequestValues = {
  customerName: "",
  customerMobile: "",
  product: "",
  paper: "",
  paperSize: "",
  quantity: 1,
  finishing: "",
  fulfillmentType: "pickup",
  deliveryDate: "",
  deliveryTime: "",
  deliveryAddress: "",
  deliveryMapLink: "",
  notes: "",
  items: [],
};

export function OrderRequestForm() {
  const [submitted, setSubmitted] = useState(false);
  const [productImages, setProductImages] = useState<File[]>([]);
  const [designFiles, setDesignFiles] = useState<File[]>([]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<OrderRequestValues, unknown, OrderRequestInput>({
    resolver: zodResolver(orderRequestSchema),
    defaultValues: emptyValues,
  });

  const fulfillmentType = watch("fulfillmentType");

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
    control,
    name: "items",
  });

  const onSubmit = () => {
    // No backend wired up yet — this is a UI-only first pass (a real
    // submission path, e.g. a review queue for a manager to approve into an
    // actual order, is a deliberate follow-up, not built here).
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-success/15 text-success">
          <CheckCircle2 className="size-7" />
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">Request received</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Thanks! Our team will review your request and confirm your order over WhatsApp shortly.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => {
            reset(emptyValues);
            setProductImages([]);
            setDesignFiles([]);
            setSubmitted(false);
          }}
        >
          Submit another request
        </Button>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-sm font-bold text-muted-foreground">Your Details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Your Name" error={errors.customerName?.message}>
            <Input {...register("customerName")} aria-invalid={!!errors.customerName} placeholder="Full name" />
          </Field>
          <Field label="Mobile Number" error={errors.customerMobile?.message}>
            <Input {...register("customerMobile")} aria-invalid={!!errors.customerMobile} placeholder="+965 5000 1111" />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-sm font-bold text-muted-foreground">What do you need printed?</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Product" error={errors.product?.message}>
            <Input {...register("product")} aria-invalid={!!errors.product} placeholder="Business Cards" />
          </Field>
          <Field label="Quantity" error={errors.quantity?.message}>
            <Input type="number" min={1} {...register("quantity")} aria-invalid={!!errors.quantity} />
          </Field>
          <Field label="Order details (optional)" className="sm:col-span-2">
            <Textarea
              {...register("finishing")}
              rows={3}
              placeholder="Paper, size, finishing — anything else about what you need"
            />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-muted-foreground">Additional Items (optional)</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendItem({ product: "", paper: "", paperSize: "", quantity: 1, finishing: "" })}
          >
            <Plus className="size-3.5" /> Add Item
          </Button>
        </div>

        {itemFields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-3 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Item {index + 2}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-destructive"
                onClick={() => removeItem(index)}
                aria-label={`Remove item ${index + 2}`}
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Product" error={errors.items?.[index]?.product?.message}>
                <Input
                  {...register(`items.${index}.product`)}
                  aria-invalid={!!errors.items?.[index]?.product}
                  placeholder="Flyers"
                />
              </Field>
              <Field label="Quantity" error={errors.items?.[index]?.quantity?.message}>
                <Input
                  type="number"
                  min={1}
                  {...register(`items.${index}.quantity`)}
                  aria-invalid={!!errors.items?.[index]?.quantity}
                />
              </Field>
              <Field label="Order details (optional)" className="sm:col-span-2">
                <Textarea
                  {...register(`items.${index}.finishing`)}
                  rows={2}
                  placeholder="Paper, size, finishing — anything else about what you need"
                />
              </Field>
            </div>
          </div>
        ))}
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-sm font-bold text-muted-foreground">Delivery</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Preferred Date" error={errors.deliveryDate?.message}>
            <Input type="date" {...register("deliveryDate")} aria-invalid={!!errors.deliveryDate} />
          </Field>
          <Field label="Preferred Time" error={errors.deliveryTime?.message}>
            <Input type="time" {...register("deliveryTime")} aria-invalid={!!errors.deliveryTime} />
          </Field>
          <Field label="Pickup or Delivery?" className="sm:col-span-2">
            <Controller
              control={control}
              name="fulfillmentType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ORDER_FULFILLMENT_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          {fulfillmentType === "delivery" && (
            <>
              <Field label="Delivery Address" className="sm:col-span-2">
                <Input {...register("deliveryAddress")} placeholder="Building, street, area" />
              </Field>
              <Field label="Map Location Link (optional)" className="sm:col-span-2">
                <Input
                  {...register("deliveryMapLink")}
                  placeholder="Paste a Google Maps link — e.g. from Share > Copy Link on a pin"
                />
              </Field>
            </>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-sm font-bold text-muted-foreground">Attachments (optional)</h2>
        <FileUpload label="Product Images" accept={PRODUCT_IMAGE_ACCEPT} files={productImages} onChange={setProductImages} />
        <FileUpload
          label="Design Files (PDF, AI, PSD, CDR, ZIP, images)"
          accept={DESIGN_FILE_ACCEPT}
          files={designFiles}
          onChange={setDesignFiles}
        />
      </Card>

      <Card className="flex flex-col gap-2 p-5">
        <Field label="Notes (optional)">
          <Textarea {...register("notes")} rows={3} placeholder="Anything else we should know" />
        </Field>
      </Card>

      <Button type="submit" variant="primary" size="lg" className="w-full">
        Submit Request
      </Button>
    </form>
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
