"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Paperclip,
  Plus,
  Printer,
  Store,
  Truck,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import { createOrderRequestSchema, type OrderRequestLanguage } from "@/lib/validation/order-request";
import { submitOrderRequest } from "@/lib/actions/order-request";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { FileUpload } from "@/components/shared/file-upload";
import { DESIGN_FILE_ACCEPT, getFileKind, MAX_TOTAL_UPLOAD_BYTES } from "@/lib/files/constants";
import { cn } from "@/lib/utils";

type OrderRequestValues = z.input<ReturnType<typeof createOrderRequestSchema>>;
type OrderRequestInput = z.infer<ReturnType<typeof createOrderRequestSchema>>;

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
  deliveryArea: "",
  deliveryBlock: "",
  deliveryStreet: "",
  deliveryBuildingNumber: "",
  notes: "",
  items: [],
};

/**
 * Who this device ordered as last time — prefilled on the next visit so a
 * returning customer only fills in the order itself. Lives only in this
 * browser; nothing is looked up by number (that would let anyone read a
 * stranger's name off the form).
 */
const REMEMBERED_KEY = "prime-order-request:me";
const REMEMBERED_FIELDS = [
  "customerName",
  "customerMobile",
  "fulfillmentType",
  "deliveryArea",
  "deliveryBlock",
  "deliveryStreet",
  "deliveryBuildingNumber",
  "deliveryAddress",
  "deliveryMapLink",
] as const;
type RememberedDetails = Partial<Pick<OrderRequestValues, (typeof REMEMBERED_FIELDS)[number]>>;

function loadRemembered(): RememberedDetails {
  try {
    const raw = window.localStorage.getItem(REMEMBERED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const saved = parsed as Record<string, unknown>;
    const details: Record<string, string> = {};
    for (const field of REMEMBERED_FIELDS) {
      if (typeof saved[field] === "string") details[field] = saved[field];
    }
    if (details.fulfillmentType !== "pickup" && details.fulfillmentType !== "delivery") delete details.fulfillmentType;
    return details as RememberedDetails;
  } catch {
    return {};
  }
}

function saveRemembered(values: OrderRequestInput) {
  try {
    const details: Record<string, string> = {};
    for (const field of REMEMBERED_FIELDS) {
      const value = values[field];
      if (typeof value === "string" && value) details[field] = value;
    }
    // Stored as the 8 local digits — the field shows +965 itself.
    if (details.customerMobile) details.customerMobile = details.customerMobile.replace(/^\+965/, "");
    window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify(details));
  } catch {
    // Private mode or storage blocked — the next visit just starts empty.
  }
}

const STRINGS = {
  ar: {
    dir: "rtl" as const,
    title: "طلب طباعة جديد",
    subtitle: "عبّي التفاصيل وبنأكد طلبك عبر واتساب",
    yourDetails: "بياناتك",
    yourName: "الاسم الكامل",
    namePlaceholder: "مثال: أحمد العتيبي",
    mobile: "رقم الجوال",
    mobilePlaceholder: "5000 1111",
    whatToPrint: "شنو حابين تطبعون؟",
    product: "نوع الطلب",
    productPlaceholder: "مثال: كروت شخصية",
    quantity: "الكمية",
    details: "تفاصيل إضافية (اختياري)",
    detailsPlaceholder: "الورق، المقاس، التشطيب، أو أي ملاحظة ثانية",
    additionalItems: "أصناف إضافية (اختياري)",
    addItem: "إضافة صنف",
    item: "الصنف",
    delivery: "التسليم",
    deliveryHint: "لو ما تعرفون بعد، اتركوها فاضية وبنتفق معكم على الموعد المناسب.",
    date: "التاريخ المفضل (اختياري)",
    time: "الوقت المفضل (اختياري)",
    fulfillment: "استلام ولا توصيل؟",
    pickup: "استلام من المحل",
    deliveryOption: "توصيل",
    address: "تفاصيل إضافية عن العنوان (اختياري)",
    addressPlaceholder: "رقم الشقة، علامة مميزة، أي توضيح ثاني",
    area: "المنطقة",
    areaPlaceholder: "مثال: السالمية",
    block: "القطعة",
    blockPlaceholder: "مثال: 5",
    street: "الشارع",
    streetPlaceholder: "مثال: شارع سالم المبارك",
    buildingNumber: "رقم المنزل / البناية",
    buildingNumberPlaceholder: "مثال: 12",
    mapLink: "رابط الموقع (اختياري)",
    mapLinkPlaceholder: "الصقوا رابط قوقل مابس",
    attachments: "المرفقات (اختياري)",
    attachmentsLabel: "التصميم أو صور للمطلوب",
    uploadHint: "اضغطوا لإرفاق صور أو ملفات التصميم",
    submit: "إرسال الطلب",
    submitting: "جاري الإرسال...",
    received: "تم استلام طلبك",
    receivedBody: "شكراً لك! فريقنا بيراجع طلبك ويأكده معك عبر واتساب قريباً.",
    another: "إرسال طلب ثاني",
    genericError: "صار خطأ، حاولوا مرة ثانية.",
    filesTooLarge: "حجم الملفات المرفقة كبير — شيلوا ملف وحاولوا مرة ثانية، أو أرسلوه لنا عبر واتساب أو الإيميل.",
    tooLargeHint: "تقدرون ترسلونه لنا عبر واتساب أو الإيميل.",
  },
  en: {
    dir: "ltr" as const,
    title: "New Print Request",
    subtitle: "Fill in the details and we'll confirm your order over WhatsApp",
    yourDetails: "Your Details",
    yourName: "Your Name",
    namePlaceholder: "e.g. Ahmad Al-Otaibi",
    mobile: "Mobile Number",
    mobilePlaceholder: "5000 1111",
    whatToPrint: "What do you need printed?",
    product: "Product",
    productPlaceholder: "e.g. Business Cards",
    quantity: "Quantity",
    details: "Order details (optional)",
    detailsPlaceholder: "Paper, size, finishing — or anything else we should know",
    additionalItems: "Additional Items (optional)",
    addItem: "Add Item",
    item: "Item",
    delivery: "Delivery",
    deliveryHint: "Not sure yet? Leave it blank and we'll agree on a time with you.",
    date: "Preferred Date (optional)",
    time: "Preferred Time (optional)",
    fulfillment: "Pickup or Delivery?",
    pickup: "Pickup",
    deliveryOption: "Delivery",
    address: "Additional Address Details (optional)",
    addressPlaceholder: "Apartment number, landmark, anything else",
    area: "Area",
    areaPlaceholder: "e.g. Salmiya",
    block: "Block",
    blockPlaceholder: "e.g. 5",
    street: "Street",
    streetPlaceholder: "e.g. Salem Al-Mubarak St",
    buildingNumber: "Building / House No.",
    buildingNumberPlaceholder: "e.g. 12",
    mapLink: "Map Location Link (optional)",
    mapLinkPlaceholder: "Paste a Google Maps link",
    attachments: "Attachments (optional)",
    attachmentsLabel: "Your design, or photos of what you need",
    uploadHint: "Tap to attach photos or design files",
    submit: "Submit Request",
    submitting: "Submitting...",
    received: "Request received",
    receivedBody: "Thanks! Our team will review your request and confirm your order over WhatsApp shortly.",
    another: "Submit another request",
    genericError: "Something went wrong. Please try again.",
    filesTooLarge: "Attached files are too large together — remove a file and try again, or send it to us over WhatsApp or email.",
    tooLargeHint: "You can send it to us over WhatsApp or email.",
  },
} satisfies Record<OrderRequestLanguage, Record<string, string>>;

export function OrderRequestForm() {
  const [lang, setLang] = useState<OrderRequestLanguage>("ar");
  const t = STRINGS[lang];

  const [submitted, setSubmitted] = useState<{ orderNumber: string } | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<OrderRequestValues, unknown, OrderRequestInput>({
    resolver: zodResolver(createOrderRequestSchema(lang)),
    defaultValues: emptyValues,
  });

  const fulfillmentType = watch("fulfillmentType");

  // Read after mount, not during render — localStorage doesn't exist on the
  // server, and reading it there would mismatch hydration.
  const [remembered, setRemembered] = useState<RememberedDetails>({});
  useEffect(() => {
    const saved = loadRemembered();
    setRemembered(saved);
    if (Object.keys(saved).length > 0) reset({ ...emptyValues, ...saved });
  }, [reset]);

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
    control,
    name: "items",
  });

  const onSubmit = async (values: OrderRequestInput) => {
    const totalBytes = attachments.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      toast.error(t.filesTooLarge);
      return;
    }

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("customerName", values.customerName);
      fd.set("customerMobile", values.customerMobile);
      fd.set("product", values.product);
      fd.set("paper", values.paper ?? "");
      fd.set("paperSize", values.paperSize ?? "");
      fd.set("quantity", String(values.quantity));
      fd.set("finishing", values.finishing ?? "");
      fd.set("fulfillmentType", values.fulfillmentType);
      fd.set("deliveryDate", values.deliveryDate ?? "");
      fd.set("deliveryTime", values.deliveryTime ?? "");
      fd.set("deliveryAddress", values.deliveryAddress ?? "");
      fd.set("deliveryMapLink", values.deliveryMapLink ?? "");
      fd.set("deliveryArea", values.deliveryArea ?? "");
      fd.set("deliveryBlock", values.deliveryBlock ?? "");
      fd.set("deliveryStreet", values.deliveryStreet ?? "");
      fd.set("deliveryBuildingNumber", values.deliveryBuildingNumber ?? "");
      fd.set("notes", values.notes ?? "");
      fd.set("items", JSON.stringify(values.items));
      fd.set("preferredLanguage", lang);
      // One box for the customer; photos land with product images (they're
      // the card thumbnail), everything else with design files.
      for (const file of attachments) {
        fd.append(getFileKind(file.name) === "image" ? "productImages" : "designFiles", file);
      }

      const result = await submitOrderRequest(fd);
      saveRemembered(values);
      setRemembered(loadRemembered());
      setSubmitted(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.genericError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const LangToggle = (
    <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm">
      {(["ar", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-bold transition-colors",
            lang === code ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          )}
        >
          {code === "ar" ? "العربية" : "English"}
        </button>
      ))}
    </div>
  );

  if (submitted) {
    return (
      <div dir={t.dir}>
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center shadow-xl">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-success/15 text-success">
            <CheckCircle2 className="size-8" />
          </div>
          <div>
            <p className="font-mono text-sm font-bold text-secondary">{submitted.orderNumber}</p>
            <p className="mt-1 text-lg font-bold text-foreground">{t.received}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.receivedBody}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            onClick={() => {
              reset({ ...emptyValues, ...remembered });
              setAttachments([]);
              setSubmitted(null);
            }}
          >
            {t.another}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div dir={t.dir} className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">{t.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        {LangToggle}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <Card className="flex flex-col gap-5 p-5 shadow-xl sm:p-6">
          <SectionHeading icon={User} label={t.yourDetails} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.yourName} error={errors.customerName?.message}>
              <Input
                {...register("customerName")}
                aria-invalid={!!errors.customerName}
                placeholder={t.namePlaceholder}
                autoComplete="name"
                dir="auto"
              />
            </Field>
            <Field label={t.mobile} error={errors.customerMobile?.message}>
              {/* +965 is fixed in front — the customer types only their 8 digits (any other way they type it still works). */}
              <div dir="ltr" className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-sm font-medium text-muted-foreground">
                  +965
                </span>
                <Input
                  {...register("customerMobile")}
                  aria-invalid={!!errors.customerMobile}
                  placeholder={t.mobilePlaceholder}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  className="pl-16"
                />
              </div>
            </Field>
          </div>

          <Separator />

          <SectionHeading icon={Printer} label={t.whatToPrint} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.product} error={errors.product?.message}>
              <Input {...register("product")} aria-invalid={!!errors.product} placeholder={t.productPlaceholder} />
            </Field>
            <Field label={t.quantity} error={errors.quantity?.message}>
              <Input type="number" inputMode="numeric" min={1} {...register("quantity")} aria-invalid={!!errors.quantity} />
            </Field>
            <Field label={t.details} className="sm:col-span-2">
              <Textarea {...register("finishing")} rows={3} placeholder={t.detailsPlaceholder} />
            </Field>
          </div>

          {itemFields.length > 0 && <Separator />}
          {itemFields.length > 0 && (
            <div className="flex flex-col gap-3">
              <span className="text-xs font-bold text-muted-foreground uppercase">{t.additionalItems}</span>
              {itemFields.map((field, index) => (
                <div key={field.id} className="flex flex-col gap-3 rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t.item} {index + 2}
                    </span>
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
                    <Field label={t.product} error={errors.items?.[index]?.product?.message}>
                      <Input {...register(`items.${index}.product`)} aria-invalid={!!errors.items?.[index]?.product} />
                    </Field>
                    <Field label={t.quantity} error={errors.items?.[index]?.quantity?.message}>
                      <Input type="number" min={1} {...register(`items.${index}.quantity`)} aria-invalid={!!errors.items?.[index]?.quantity} />
                    </Field>
                    <Field label={t.details} className="sm:col-span-2">
                      <Textarea {...register(`items.${index}.finishing`)} rows={2} placeholder={t.detailsPlaceholder} />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-1.5"
            onClick={() => appendItem({ product: "", paper: "", paperSize: "", quantity: 1, finishing: "" })}
          >
            <Plus className="size-3.5" /> {t.addItem}
          </Button>

          <Separator />

          <SectionHeading icon={Truck} label={t.delivery} />
          <Controller
            control={control}
            name="fulfillmentType"
            render={({ field }) => (
              <div role="radiogroup" aria-label={t.fulfillment} className="grid grid-cols-2 gap-3">
                {(
                  [
                    { value: "pickup", label: t.pickup, icon: Store },
                    { value: "delivery", label: t.deliveryOption, icon: Truck },
                  ] as const
                ).map(({ value, label, icon: Icon }) => {
                  const selected = field.value === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => field.onChange(value)}
                      className={cn(
                        "flex min-h-12 items-center justify-center gap-1.5 rounded-xl border-2 px-2 text-sm font-semibold whitespace-nowrap transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-secondary bg-secondary/10 text-secondary"
                          : "border-border bg-card text-muted-foreground hover:border-secondary/50 hover:text-foreground"
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fulfillmentType === "delivery" && (
              <>
                <Field label={t.area} error={errors.deliveryArea?.message}>
                  <Input {...register("deliveryArea")} aria-invalid={!!errors.deliveryArea} placeholder={t.areaPlaceholder} />
                </Field>
                <Field label={t.block} error={errors.deliveryBlock?.message}>
                  <Input
                    {...register("deliveryBlock")}
                    aria-invalid={!!errors.deliveryBlock}
                    placeholder={t.blockPlaceholder}
                    inputMode="numeric"
                  />
                </Field>
                <Field label={t.street} error={errors.deliveryStreet?.message}>
                  <Input {...register("deliveryStreet")} aria-invalid={!!errors.deliveryStreet} placeholder={t.streetPlaceholder} />
                </Field>
                <Field label={t.buildingNumber} error={errors.deliveryBuildingNumber?.message}>
                  <Input
                    {...register("deliveryBuildingNumber")}
                    aria-invalid={!!errors.deliveryBuildingNumber}
                    placeholder={t.buildingNumberPlaceholder}
                  />
                </Field>
                <Field label={t.address} className="sm:col-span-2" icon={MapPin}>
                  <Input {...register("deliveryAddress")} placeholder={t.addressPlaceholder} />
                </Field>
                <Field label={t.mapLink} className="sm:col-span-2">
                  <Input {...register("deliveryMapLink")} placeholder={t.mapLinkPlaceholder} dir="ltr" inputMode="url" />
                </Field>
              </>
            )}
            <p className="text-xs text-muted-foreground sm:col-span-2">{t.deliveryHint}</p>
            <Field label={t.date} error={errors.deliveryDate?.message} icon={Calendar}>
              <Input type="date" {...register("deliveryDate")} aria-invalid={!!errors.deliveryDate} />
            </Field>
            <Field label={t.time} error={errors.deliveryTime?.message} icon={Clock}>
              <Input type="time" {...register("deliveryTime")} aria-invalid={!!errors.deliveryTime} />
            </Field>
          </div>

          <Separator />

          <SectionHeading icon={Paperclip} label={t.attachments} />
          <FileUpload
            label={t.attachmentsLabel}
            accept={DESIGN_FILE_ACCEPT}
            files={attachments}
            onChange={setAttachments}
            hint={t.uploadHint}
            tooLargeHint={t.tooLargeHint}
            shrinkImages
          />
        </Card>

        <Button type="submit" variant="primary" size="lg" className="w-full gap-2" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {isSubmitting ? t.submitting : t.submit}
        </Button>
      </form>
    </div>
  );
}

function SectionHeading({ icon: Icon, label }: { icon: typeof User; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
        <Icon className="size-4" />
      </span>
      <h2 className="text-sm font-bold text-foreground">{label}</h2>
    </div>
  );
}

function Field({
  label,
  error,
  className,
  icon: Icon,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  icon?: typeof User;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 gap-1.5">
        {Icon && <Icon className="size-3.5 text-muted-foreground" />}
        {label}
      </Label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
