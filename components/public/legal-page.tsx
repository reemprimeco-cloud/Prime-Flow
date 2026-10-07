import Image from "next/image";

/**
 * Plain public page for the privacy policy / terms of use — needed as real,
 * reachable URLs by the Intuit Developer app (QuickBooks integration, see
 * docs/QUICKBOOKS.md). No auth, no data: static text only.
 */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col items-center gap-3 pt-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-border shadow-[0_8px_24px_-8px_rgba(30,64,175,0.3)]">
            <Image src="/logo.jpg" alt="Prime Printing Co." width={56} height={56} className="size-full object-cover" priority />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">Prime Printing Co. · Last updated {updated}</p>
        </div>

        <article className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 text-sm leading-relaxed text-foreground [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-bold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_a]:font-medium [&_a]:text-secondary [&_a]:underline">
          {children}
        </article>
      </div>
    </div>
  );
}
