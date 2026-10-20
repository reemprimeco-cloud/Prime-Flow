"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getTvBoard, type TvBoardData } from "@/lib/actions/tv";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { CHANNELS } from "@/lib/realtime/constants";
import { TV_COLUMNS } from "@/types/domain";
import { TvStatsBar } from "@/components/tv/tv-stats-bar";
import { TvStatusColumn } from "@/components/tv/tv-status-column";

export function TvDashboardClient({ initialBoard }: { initialBoard: TvBoardData }) {
  const queryClient = useQueryClient();

  const boardQuery = useQuery({
    queryKey: ["tv-board"],
    queryFn: () => getTvBoard(),
    initialData: initialBoard,
    refetchInterval: 60_000,
  });

  useRealtimeChannel(CHANNELS.production, () => {
    queryClient.invalidateQueries({ queryKey: ["tv-board"] });
  });
  useRealtimeChannel(CHANNELS.materialRequests, () => {
    queryClient.invalidateQueries({ queryKey: ["tv-board"] });
  });

  // One clock for every card's countdown (rather than a timer per card).
  // Null until mounted, so server and client render the same markup.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(interval);
  }, []);

  const board = boardQuery.data ?? initialBoard;

  return (
    <div className="grid h-full grid-rows-[auto_1fr] gap-[1rem] overflow-hidden text-foreground">
      <TvStatsBar
        activeOrders={board.activeOrders}
        delayedOrders={board.delayedOrders}
        employeesWorking={board.employeesWorking}
      />

      {/* Four equal columns, every one readable from across the room.
          `waiting_materials` isn't on the TV at all -- only the
          Manager/Employee dashboards. */}
      <main className="grid min-h-0 grid-cols-4 gap-[1rem]">
        {TV_COLUMNS.map((status) => (
          <TvStatusColumn key={status} status={status} orders={board.columns[status]} now={now} />
        ))}
      </main>
    </div>
  );
}
