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

/** Renders a `HH:mm` / `HH:mm:ss` delivery-time column value as `h:mm AM/PM`. */
export function formatDeliveryTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return time;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
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
