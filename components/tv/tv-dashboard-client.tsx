"use client";

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

  const board = boardQuery.data ?? initialBoard;

  return (
    <div className="grid h-full grid-rows-[auto_1fr] overflow-hidden text-foreground">
      <TvStatsBar
        activeOrders={board.activeOrders}
        delayedOrders={board.delayedOrders}
        employeesWorking={board.employeesWorking}
      />

      {/* No footer here anymore -- that row's height now belongs to the
          columns, so more orders fit per status without scrolling (a TV
          remote can't scroll anyway). Columns stay semi-transparent
          (tv-status-column.tsx) so the ambient background pattern from
          TvLayout still shows through instead of being fully hidden. */}
      <main className="grid min-h-0 grid-cols-4 gap-4 p-4">
        {TV_COLUMNS.map((status) => (
          <TvStatusColumn key={status} status={status} orders={board.columns[status]} />
        ))}
      </main>
    </div>
  );
}
