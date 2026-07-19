"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

import { formatCountdown, getCountdownColor, getMinutesRemaining, toDeliveryDate } from "@/lib/utils/countdown";
import { cn } from "@/lib/utils";

const COLOR_CLASSES = {
  green: "bg-success text-success-foreground border-success",
  yellow: "bg-warning text-warning-foreground border-warning",
  orange: "bg-warning text-warning-foreground border-warning",
  red: "bg-destructive text-destructive-foreground border-destructive",
} as const;

const SIZE_CLASSES = {
  sm: "gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold [&_svg]:size-3.5",
  lg: "gap-2 rounded-xl border-2 px-4 py-2 text-lg font-extrabold [&_svg]:size-5",
} as const;

interface CountdownTimerProps {
  deliveryDate: string;
  deliveryTime: string;
  className?: string;
  size?: "sm" | "lg";
}

export function CountdownTimer({ deliveryDate, deliveryTime, className, size = "sm" }: CountdownTimerProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!now) {
    return (
      <span
        className={cn(
          "inline-flex items-center whitespace-nowrap border-border text-muted-foreground",
          SIZE_CLASSES[size],
          className
        )}
      >
        <Clock />—
      </span>
    );
  }

  const deliveryAt = toDeliveryDate(deliveryDate, deliveryTime);
  const minutesRemaining = getMinutesRemaining(deliveryAt, now);
  const color = getCountdownColor(minutesRemaining);

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap",
        SIZE_CLASSES[size],
        COLOR_CLASSES[color],
        className
      )}
    >
      <Clock />
      {formatCountdown(minutesRemaining)}
    </span>
  );
}

/** Just the color, for use as a card accent (left border, dot, etc). */
export function useCountdownColor(deliveryDate: string, deliveryTime: string) {
  const [color, setColor] = useState<"green" | "yellow" | "orange" | "red">("green");

  useEffect(() => {
    const update = () => {
      const deliveryAt = toDeliveryDate(deliveryDate, deliveryTime);
      setColor(getCountdownColor(getMinutesRemaining(deliveryAt)));
    };
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [deliveryDate, deliveryTime]);

  return color;
}
