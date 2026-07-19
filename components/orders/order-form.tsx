"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronUp, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import { orderFormSchema, type OrderFormInput } from "@/lib/validation/order";
import {
  createOrder,
  deleteOrderFile,
  searchCustomers,
  updateOrder,
  type CustomerSuggestion,
  type OrderDetail,
} from "@/lib/actions/orders";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from "@/components/shared/file-upload";
import { DESIGN_FILE_ACCEPT, MAX_TOTAL_UPLOAD_BYTES, PRODUCT_IMAGE_ACCEPT } from "@/lib/files/constants";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/constants";
import { ORDER_FULFILLMENT_TYPE_LABELS, ORDER_PRIORITY_LABELS } from "@/types/domain";

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
      preferredLanguage: "en",
      whatsappEnabled: true,
      preferredChannel: "whatsapp",
      notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
      product: "",
      paper: "",
      paperSize: "",
      quantity: 1,
      finishing: "",
      fulfillmentType: "pickup",
      priority: "normal",
      deliveryDate: "",
      deliveryTime: "",
      deliveryAddress: "",
      deliveryMapLink: "",
      notes: "",
      employeeIds: [],
      items: [],
    };
  }
  return {
    customerName: order.customerName,
    customerMobile: order.customerMobile,
    // Always English, always notify — see DEFAULT_NOTIFICATION_PREFERENCES;
    // an order edited from here on out is normalized to these regardless of
    // whatever it was created with, since the form no longer exposes a way
    // to set them differently.
    preferredLanguage: "en",
    whatsappEnabled: true,
    preferredChannel: order.preferredChannel,
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
    product: order.product,
    paper: order.paper ?? "",
    paperSize: order.paperSize ?? "",
    quantity: order.quantity,
    finishing: order.finishing ?? "",
    fulfillmentType: order.fulfillmentType,
    priority: order.priority,
    deliveryDate: order.deliveryDate,
    deliveryTime: order.deliveryTime.slice(0, 5),
    deliveryAddress: order.deliveryAddress ?? "",
    deliveryMapLink: order.deliveryMapLink ?? "",
    notes: order.notes ?? "",
    employeeIds: order.assignedEmployees.map((e) => e.id),
    items: order.items.map((item) => ({
      product: item.product,
      paper: item.paper ?? "",
      paperSize: item.paperSize ?? "",
      quantity: item.quantity,
      finishing: item.finishing ?? "",
      employeeId: item.employeeId ?? "",
    })),
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

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerSuggestion[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const customerSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const fulfillmentType = watch("fulfillmentType");

  const moveEmployee = (from: number, to: number) => {
    if (to < 0 || to >= employeeIds.length) return;
    const reordered = [...employeeIds];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setValue("employeeIds", reordered);
  };

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
    control,
    name: "items",
  });

  // RHF only reads `defaultValues` on first mount — since this form is a
  // single long-lived instance reused for every order, we have to
  // explicitly re-sync whenever the sheet opens. Keying only on `order`
  // isn't enough: "New Order" always passes order=null, so reopening a
  // blank form after closing one without saving left whatever had been
  // typed still in place, since null === null triggers no re-sync.
  useEffect(() => {
    if (!open) return;
    reset(defaultValues(order));
    setExistingImages(order?.productImages ?? []);
    setExistingDesigns(order?.designFiles ?? []);
    setProductImages([]);
    setDesignFiles([]);
    setCustomerQuery("");
    setCustomerSuggestions([]);
    setShowCustomerSuggestions(false);
  }, [open, order, reset]);

  // Debounced customer-name autocomplete, sourced from past orders (not a
  // real customer entity — see ARCHITECTURE.md). Only triggered by genuine
  // typing (the input's onChange below), never by the reset() above, so
  // opening the sheet or switching to edit an order doesn't fire a search.
  useEffect(() => {
    if (customerSearchDebounce.current) clearTimeout(customerSearchDebounce.current);
    if (customerQuery.trim().length < 2) {
      setCustomerSuggestions([]);
      return;
    }
    setIsSearchingCustomers(true);
    customerSearchDebounce.current = setTimeout(() => {
      searchCustomers(customerQuery)
        .then(setCustomerSuggestions)
        .catch((error) => {
          setCustomerSuggestions([]);
          toast.error(error instanceof Error ? error.message : "Couldn't search customers — try reloading the page.");
        })
        .finally(() => setIsSearchingCustomers(false));
    }, 250);
    return () => {
      if (customerSearchDebounce.current) clearTimeout(customerSearchDebounce.current);
    };
  }, [customerQuery]);

  const handleSelectCustomer = (customer: CustomerSuggestion) => {
    setValue("customerName", customer.customerName, { shouldValidate: true });
    setValue("customerMobile", customer.customerMobile, { shouldValidate: true });
    setValue("preferredChannel", customer.preferredChannel);
    setShowCustomerSuggestions(false);
    setCustomerSuggestions([]);
  };

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
        const totalBytes = [...productImages, ...designFiles].reduce((sum, file) => sum + file.size, 0);
        if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
          const maxMb = (MAX_TOTAL_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
          toast.error(`Attached files are too large together — max ${maxMb}MB combined. Remove or shrink a file.`);
          return;
        }

        const formData = new FormData();
        formData.set("customerName", values.customerName);
        formData.set("customerMobile", values.customerMobile);
        formData.set("preferredLanguage", values.preferredLanguage);
        formData.set("whatsappEnabled", String(values.whatsappEnabled));
        formData.set("preferredChannel", values.preferredChannel ?? "whatsapp");
        formData.set("notificationPreferences", JSON.stringify(values.notificationPreferences));
        formData.set("product", values.product);
        formData.set("paper", values.paper ?? "");
        formData.set("paperSize", values.paperSize ?? "");
        formData.set("quantity", String(values.quantity));
        formData.set("finishing", values.finishing ?? "");
        formData.set("fulfillmentType", values.fulfillmentType);
        formData.set("priority", values.priority);
        formData.set("deliveryDate", values.deliveryDate);
        formData.set("deliveryTime", values.deliveryTime);
        formData.set("deliveryAddress", values.deliveryAddress ?? "");
        formData.set("deliveryMapLink", values.deliveryMapLink ?? "");
        formData.set("notes", values.notes ?? "");
        formData.set("items", JSON.stringify(values.items));
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

        <form
          id="order-form"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <SheetBody className="flex flex-col gap-6">
            <section className="flex flex-col gap-4">
              <h3 className="text-sm font-bold text-muted-foreground">Customer</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Customer Name" error={errors.customerName?.message}>
                  <div className="relative">
                    <Controller
                      control={control}
                      name="customerName"
                      render={({ field }) => (
                        <Input
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            setCustomerQuery(e.target.value);
                            setShowCustomerSuggestions(true);
                          }}
                          onFocus={() => setShowCustomerSuggestions(true)}
                          onBlur={() => {
                            field.onBlur();
                            // Delay so a suggestion's onClick can fire before the list unmounts.
                            setTimeout(() => setShowCustomerSuggestions(false), 150);
                          }}
                          autoComplete="off"
                          aria-invalid={!!errors.customerName}
                        />
                      )}
                    />
                    {showCustomerSuggestions && customerQuery.trim().length >= 2 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-lg scrollbar-thin">
                        {isSearchingCustomers && (
                          <div className="flex items-center justify-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin" /> Searching…
                          </div>
                        )}
                        {!isSearchingCustomers && customerSuggestions.length === 0 && (
                          <p className="px-3 py-2.5 text-xs text-muted-foreground">No matching customers.</p>
                        )}
                        {customerSuggestions.map((customer) => (
                          <button
                            key={customer.customerMobile}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectCustomer(customer)}
                            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted/40"
                          >
                            <span className="text-sm font-medium text-foreground">{customer.customerName}</span>
                            <span className="text-xs text-muted-foreground">{customer.customerMobile}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Field>
                <Field label="Mobile Number" error={errors.customerMobile?.message}>
                  <Input {...register("customerMobile")} aria-invalid={!!errors.customerMobile} placeholder="+965 5000 1111" />
                </Field>
              </div>
            </section>

            <section className="flex flex-col gap-4">
              <h3 className="text-sm font-bold text-muted-foreground">Notifications</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Preferred Channel">
                  <Controller
                    control={control}
                    name="preferredChannel"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="email" disabled>
                            Email (coming soon)
                          </SelectItem>
                          <SelectItem value="sms" disabled>
                            SMS (coming soon)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </div>
              <p className="rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                The customer is messaged automatically at every stage — order received, in production, ready for
                pickup, and out for delivery.
              </p>
            </section>

            <section className="flex flex-col gap-4">
              <h3 className="text-sm font-bold text-muted-foreground">Specifications</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Product" error={errors.product?.message}>
                  <Input {...register("product")} aria-invalid={!!errors.product} placeholder="Business Cards" />
                </Field>
                <Field label="Quantity" error={errors.quantity?.message}>
                  <Input type="number" min={1} {...register("quantity")} aria-invalid={!!errors.quantity} />
                </Field>
                <Field label="Paper (optional)">
                  <Input {...register("paper")} placeholder="Optional" />
                </Field>
                <Field label="Paper Size (optional)">
                  <Input {...register("paperSize")} placeholder="Optional" />
                </Field>
                <Field label="Finishing (optional)" className="col-span-2">
                  <Input {...register("finishing")} placeholder="Optional" />
                </Field>
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-bold text-muted-foreground">Assign Employees — Item 1</h3>
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

              {employeeIds.length > 1 && (
                <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Hand-off order — each person only sees the job once the one before them clicks &ldquo;Ready
                    for Next&rdquo;
                  </span>
                  <ol className="flex flex-col gap-1.5">
                    {employeeIds.map((id, index) => {
                      const employee = employees.find((e) => e.id === id);
                      return (
                        <li key={id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">{employee?.fullName ?? "Unknown"}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground"
                            disabled={index === 0}
                            onClick={() => moveEmployee(index, index - 1)}
                            aria-label={`Move ${employee?.fullName ?? "employee"} earlier`}
                          >
                            <ChevronUp className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground"
                            disabled={index === employeeIds.length - 1}
                            onClick={() => moveEmployee(index, index + 1)}
                            aria-label={`Move ${employee?.fullName ?? "employee"} later`}
                          >
                            <ChevronDown className="size-3.5" />
                          </Button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </section>

            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-muted-foreground">Additional Items</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    appendItem({ product: "", paper: "", paperSize: "", quantity: 1, finishing: "", employeeId: "" })
                  }
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
                    <Field label="Paper (optional)">
                      <Input {...register(`items.${index}.paper`)} placeholder="Optional" />
                    </Field>
                    <Field label="Paper Size (optional)">
                      <Input {...register(`items.${index}.paperSize`)} placeholder="Optional" />
                    </Field>
                    <Field label="Finishing (optional)" className="col-span-2">
                      <Input {...register(`items.${index}.finishing`)} placeholder="Optional" />
                    </Field>
                    <Field label="Assign To" className="col-span-2">
                      <Controller
                        control={control}
                        name={`items.${index}.employeeId`}
                        render={({ field: employeeField }) => (
                          <Select
                            value={employeeField.value || "none"}
                            onValueChange={(value) => employeeField.onChange(value === "none" ? "" : value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Unassigned</SelectItem>
                              {employees.map((employee) => (
                                <SelectItem key={employee.id} value={employee.id}>
                                  {employee.fullName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </section>

            <section className="flex flex-col gap-4">
              <h3 className="text-sm font-bold text-muted-foreground">Delivery</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Delivery Date" error={errors.deliveryDate?.message}>
                  <Input type="date" {...register("deliveryDate")} aria-invalid={!!errors.deliveryDate} />
                </Field>
                <Field label="Delivery Time" error={errors.deliveryTime?.message}>
                  <Input type="time" {...register("deliveryTime")} aria-invalid={!!errors.deliveryTime} />
                </Field>
                <Field label="Fulfillment">
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
                <Field label="Priority">
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
                {fulfillmentType === "delivery" && (
                  <>
                    <Field label="Delivery Address" className="col-span-2">
                      <Input {...register("deliveryAddress")} placeholder="Building, street, area" />
                    </Field>
                    <Field label="Map Location Link (optional)" className="col-span-2">
                      <Input
                        {...register("deliveryMapLink")}
                        placeholder="Paste a Google Maps link — e.g. from Share > Copy Link on a pin"
                      />
                    </Field>
                  </>
                )}
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
