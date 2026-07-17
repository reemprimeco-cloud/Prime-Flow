import { differenceInMinutes } from "date-fns";

import { COUNTDOWN_THRESHOLDS, type CountdownColor } from "@/types/domain";

/** Combines a `date` (YYYY-MM-DD) and `time` (HH:MM:SS) column pair into a Date. */
export function toDeliveryDate(deliveryDate: string, deliveryTime: string): Date {
  return new Date(`${deliveryDate}T${deliveryTime}`);
}

export function getMinutesRemaining(deliveryAt: Date, now: Date = new Date()): number {
  return differenceInMinutes(deliveryAt, now);
}

export function getCountdownColor(minutesRemaining: number): CountdownColor {
  if (minutesRemaining < 0) return "red";
  if (minutesRemaining < COUNTDOWN_THRESHOLDS.orange) return "orange";
  if (minutesRemaining < COUNTDOWN_THRESHOLDS.yellow) return "yellow";
  return "green";
}

export function formatCountdown(minutesRemaining: number): string {
  const isPast = minutesRemaining < 0;
  const abs = Math.abs(minutesRemaining);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  const label = parts.join(" ");
  return isPast ? `${label} late` : `${label} left`;
}
