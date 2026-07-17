import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
        primary: "bg-primary text-primary-foreground hover:bg-primary/90 border border-white/10",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        success: "bg-success text-success-foreground hover:bg-success/90",
        warning: "bg-warning text-warning-foreground hover:bg-warning/90",
        outline: "border border-border bg-transparent hover:bg-muted text-foreground",
        ghost: "hover:bg-muted text-foreground",
        link: "text-secondary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2 [&_svg]:size-4",
        sm: "h-9 rounded-lg px-3 text-xs [&_svg]:size-4",
        lg: "h-14 rounded-2xl px-8 text-base [&_svg]:size-5",
        xl: "h-16 rounded-2xl px-10 text-lg [&_svg]:size-6",
        icon: "h-11 w-11 [&_svg]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
