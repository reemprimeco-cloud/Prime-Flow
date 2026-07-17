import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap w-fit",
  {
    variants: {
      variant: {
        default: "bg-secondary/15 text-secondary border-secondary/30",
        primary: "bg-primary text-primary-foreground border-white/10",
        success: "bg-success/15 text-success border-success/30",
        warning: "bg-warning/15 text-warning border-warning/30",
        destructive: "bg-destructive/15 text-destructive border-destructive/30",
        outline: "bg-transparent text-foreground border-border",
        muted: "bg-muted text-muted-foreground border-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { Badge, badgeVariants };
