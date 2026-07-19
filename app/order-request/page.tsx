import type { Metadata } from "next";
import Image from "next/image";

import { OrderRequestForm } from "@/components/public/order-request-form";

export const metadata: Metadata = {
  title: "Request a Print Job — Prime Printing Co.",
};

export default function OrderRequestPage() {
  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col items-center gap-3 pt-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-border shadow-[0_8px_24px_-8px_rgba(30,64,175,0.3)]">
            <Image src="/logo.jpg" alt="Prime Printing Co." width={56} height={56} className="size-full object-cover" priority />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Prime Printing Co.</h1>
            <p className="text-sm text-muted-foreground">
              Tell us what you need printed — we&rsquo;ll confirm your order over WhatsApp.
            </p>
          </div>
        </div>

        <OrderRequestForm />
      </div>
    </div>
  );
}
