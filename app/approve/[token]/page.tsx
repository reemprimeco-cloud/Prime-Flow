import type { Metadata } from "next";
import Image from "next/image";
import { XCircle } from "lucide-react";

import { getDesignApprovalByToken } from "@/lib/actions/design-approval";
import { DesignApprovalView } from "@/components/public/design-approval-view";

export const metadata: Metadata = {
  title: "Design Approval — Prime Printing Co.",
};

export const dynamic = "force-dynamic";

export default async function DesignApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const approval = await getDesignApprovalByToken(token);

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <div className="flex flex-col items-center gap-3 pt-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-border shadow-[0_8px_24px_-8px_rgba(30,64,175,0.3)]">
            <Image src="/logo.jpg" alt="Prime Printing Co." width={56} height={56} className="size-full object-cover" priority />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Prime Printing Co.</h1>
            <p className="text-sm text-muted-foreground">Design Approval</p>
          </div>
        </div>

        {approval ? (
          <DesignApprovalView token={token} approval={approval} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
            <XCircle className="size-8 text-destructive" />
            <p className="text-sm font-semibold text-foreground">This link isn&rsquo;t valid.</p>
            <p className="text-sm text-muted-foreground">
              It may have expired, or a newer link was already sent for this order. Please contact us if you need a new
              one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
