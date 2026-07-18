"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

import { formatCountdown, getCountdownColor, getMinutesRemaining, toDeliveryDate } from "@/lib/utils/countdown";
import { cn } from "@/lib/utils";

const COLOR_CLASSES = {
  green: "bg-success/15 text-success border-success/30",
  yellow: "bg-warning/15 text-warning border-warning/30",
  orange: "bg-warning/25 text-warning border-warning/40",
  red: "bg-destructive/15 text-destructive border-destructive/30",
} as const;

interface CountdownTimerProps {
  deliveryDate: string;
  deliveryTime: string;
  className?: string;
}

export function CountdownTimer({ deliveryDate, deliveryTime, className }: CountdownTimerProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!now) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold border-border text-muted-foreground", className)}>
        <Clock className="size-3.5" />
        —
      </span>
    );
  }

  const deliveryAt = toDeliveryDate(deliveryDate, deliveryTime);
  const minutesRemaining = getMinutesRemaining(deliveryAt, now);
  const color = getCountdownColor(minutesRemaining);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        COLOR_CLASSES[color],
        className
      )}
    >
      <Clock className="size-3.5" />
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
