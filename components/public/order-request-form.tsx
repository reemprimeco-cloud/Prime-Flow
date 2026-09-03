"use client";

import { useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  MessageSquareText,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from "@/components/shared/file-upload";
import { DESIGN_FILE_ACCEPT, PRODUCT_IMAGE_ACCEPT } from "@/lib/files/constants";
import { cn } from "@/lib/utils";

type OrderRequestValues = z.input<ReturnType<typeof createOrderRequestSchema>>;
type OrderRequestInput = z.infer<ReturnType<typeof createOrderRequestSchema>>;

const emptyValues: OrderRequestValues = {
  customerName: "",
  customerMobile: "+965",
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

const STRINGS = {
  ar: {
    dir: "rtl" as const,
    title: "طلب طباعة جديد",
    subtitle: "عبّي التفاصيل وبنأكد طلبك عبر واتساب",
    yourDetails: "بياناتك",
    yourName: "الاسم الكامل",
    namePlaceholder: "مثال: أحمد العتيبي",
    mobile: "رقم الجوال",
    mobilePlaceholder: "+965 5000 1111",
    whatToPrint: "شنو حابين تطبعون؟",
    product: "نوع الطلب",
    productPlaceholder: "مثال: كروت شخصية",
    quantity: "الكمية",
    details: "تفاصيل إضافية (اختياري)",
    detailsPlaceholder: "الورق، المقاس، التشطيب — أي شي ثاني",
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
    address: "عنوان التوصيل",
    addressPlaceholder: "المبنى، الشارع، المنطقة",
    mapLink: "رابط الموقع (اختياري)",
    mapLinkPlaceholder: "الصقي رابط قوقل مابس",
    attachments: "المرفقات (اختياري)",
    productImages: "صور المنتج",
    designFiles: "ملفات التصميم",
    uploadHint: "اضغط لرفع ملف أو أكثر",
    notes: "ملاحظات (اختياري)",
    notesPlaceholder: "أي شي ثاني نعرفه",
    submit: "إرسال الطلب",
    submitting: "جاري الإرسال...",
    received: "تم استلام طلبك",
    receivedBody: "شكراً لك! فريقنا بيراجع طلبك ويأكده معك عبر واتساب قريباً.",
    another: "إرسال طلب ثاني",
    genericError: "صار خطأ، حاولي مرة ثانية.",
  },
  en: {
    dir: "ltr" as const,
    title: "New Print Request",
    subtitle: "Fill in the details and we'll confirm your order over WhatsApp",
    yourDetails: "Your Details",
    yourName: "Your Name",
    namePlaceholder: "e.g. Ahmad Al-Otaibi",
    mobile: "Mobile Number",
    mobilePlaceholder: "+965 5000 1111",
    whatToPrint: "What do you need printed?",
    product: "Product",
    productPlaceholder: "e.g. Business Cards",
    quantity: "Quantity",
    details: "Order details (optional)",
    detailsPlaceholder: "Paper, size, finishing — anything else",
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
    address: "Delivery Address",
    addressPlaceholder: "Building, street, area",
    mapLink: "Map Location Link (optional)",
    mapLinkPlaceholder: "Paste a Google Maps link",
    attachments: "Attachments (optional)",
    productImages: "Product Images",
    designFiles: "Design Files",
    uploadHint: "Click to upload one or more files",
    notes: "Notes (optional)",
    notesPlaceholder: "Anything else we should know",
    submit: "Submit Request",
    submitting: "Submitting...",
    received: "Request received",
    receivedBody: "Thanks! Our team will review your request and confirm your order over WhatsApp shortly.",
    another: "Submit another request",
    genericError: "Something went wrong. Please try again.",
  },
} satisfies Record<OrderRequestLanguage, Record<string, string>>;

export function OrderRequestForm() {
  const [lang, setLang] = useState<OrderRequestLanguage>("ar");
  const t = STRINGS[lang];

  const [submitted, setSubmitted] = useState<{ orderNumber: string } | null>(null);
  const [productImages, setProductImages] = useState<File[]>([]);
  const [designFiles, setDesignFiles] = useState<File[]>([]);
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

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
    control,
    name: "items",
  });

  const onSubmit = async (values: OrderRequestInput) => {
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
      fd.set("notes", values.notes ?? "");
      fd.set("items", JSON.stringify(values.items));
      fd.set("preferredLanguage", lang);
      for (const file of productImages) fd.append("productImages", file);
      for (const file of designFiles) fd.append("designFiles", file);

      const result = await submitOrderRequest(fd);
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
              reset(emptyValues);
              setProductImages([]);
              setDesignFiles([]);
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
              <Input {...register("customerName")} aria-invalid={!!errors.customerName} placeholder={t.namePlaceholder} />
            </Field>
            <Field label={t.mobile} error={errors.customerMobile?.message}>
              <Input {...register("customerMobile")} aria-invalid={!!errors.customerMobile} placeholder={t.mobilePlaceholder} dir="ltr" />
            </Field>
          </div>

          <Separator />

          <SectionHeading icon={Printer} label={t.whatToPrint} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.product} error={errors.product?.message}>
              <Input {...register("product")} aria-invalid={!!errors.product} placeholder={t.productPlaceholder} />
            </Field>
            <Field label={t.quantity} error={errors.quantity?.message}>
              <Input type="number" min={1} {...register("quantity")} aria-invalid={!!errors.quantity} />
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
          <p className="text-xs text-muted-foreground">{t.deliveryHint}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.date} error={errors.deliveryDate?.message} icon={Calendar}>
              <Input type="date" {...register("deliveryDate")} aria-invalid={!!errors.deliveryDate} />
            </Field>
            <Field label={t.time} error={errors.deliveryTime?.message} icon={Clock}>
              <Input type="time" {...register("deliveryTime")} aria-invalid={!!errors.deliveryTime} />
            </Field>
            <Field label={t.fulfillment} className="sm:col-span-2">
              <Controller
                control={control}
                name="fulfillmentType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pickup">
                        <Store className="size-3.5" /> {t.pickup}
                      </SelectItem>
                      <SelectItem value="delivery">
                        <Truck className="size-3.5" /> {t.deliveryOption}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            {fulfillmentType === "delivery" && (
              <>
                <Field label={t.address} className="sm:col-span-2" icon={MapPin}>
                  <Input {...register("deliveryAddress")} placeholder={t.addressPlaceholder} />
                </Field>
                <Field label={t.mapLink} className="sm:col-span-2">
                  <Input {...register("deliveryMapLink")} placeholder={t.mapLinkPlaceholder} dir="ltr" />
                </Field>
              </>
            )}
          </div>

          <Separator />

          <SectionHeading icon={Paperclip} label={t.attachments} />
          <div className="flex flex-col gap-4">
            <FileUpload label={t.productImages} accept={PRODUCT_IMAGE_ACCEPT} files={productImages} onChange={setProductImages} hint={t.uploadHint} />
            <FileUpload label={t.designFiles} accept={DESIGN_FILE_ACCEPT} files={designFiles} onChange={setDesignFiles} hint={t.uploadHint} />
          </div>

          <Separator />

          <SectionHeading icon={MessageSquareText} label={t.notes} />
          <Textarea {...register("notes")} rows={3} placeholder={t.notesPlaceholder} />
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
