"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";

import { listRecentActivity } from "@/lib/actions/activity";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { CHANNELS } from "@/lib/realtime/constants";
import { Card } from "@/components/ui/card";

export function ActivityFeed({ initialEntries }: { initialEntries: Awaited<ReturnType<typeof listRecentActivity>> }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["activity-feed"],
    queryFn: () => listRecentActivity(),
    initialData: initialEntries,
    refetchInterval: 30_000,
  });

  useRealtimeChannel(CHANNELS.production, () => queryClient.invalidateQueries({ queryKey: ["activity-feed"] }));
  useRealtimeChannel(CHANNELS.materialRequests, () => queryClient.invalidateQueries({ queryKey: ["activity-feed"] }));
  useRealtimeChannel(CHANNELS.notifications, () => queryClient.invalidateQueries({ queryKey: ["activity-feed"] }));

  const entries = query.data ?? initialEntries;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
        <Activity className="size-4" />
        Activity Feed
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has happened yet today.</p>
      ) : (
        <ul className="flex max-h-[480px] flex-col gap-3 overflow-y-auto scrollbar-thin">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{entry.actorName}</span>{" "}
                  {actionVerb(entry.label)}
                  {entry.orderNumber && <span className="font-mono text-secondary"> {entry.orderNumber}</span>}
                </p>
                <p className="text-xs text-muted-foreground">{entry.label}</p>
              </div>
              <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function actionVerb(label: string): string {
  if (label.includes("→")) return "moved";
  if (label.startsWith("Material requested")) return "requested materials for";
  if (label.startsWith("Material request approved")) return "approved a material request for";
  if (label.startsWith("Notification sent")) return "notified";
  if (label.startsWith("Employee assigned")) return "assigned someone to";
  if (label.startsWith("Order created")) return "created";
  return "updated";
}
