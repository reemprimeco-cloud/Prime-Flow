"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Gauge } from "lucide-react";

import { listEmployeeWorkload, type EmployeeWorkload } from "@/lib/actions/workload";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { CHANNELS } from "@/lib/realtime/constants";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SortKey = keyof Omit<EmployeeWorkload, "employeeId" | "employeeName">;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "activeJobs", label: "Active Jobs" },
  { key: "queuedJobs", label: "Queued" },
  { key: "completedToday", label: "Completed Today" },
  { key: "avgCompletionMinutes", label: "Avg Completion" },
  { key: "waitingMaterials", label: "Waiting for Materials" },
  { key: "delayedJobs", label: "Delayed" },
];

function formatMinutes(minutes: number | null): string {
  if (minutes == null) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export function WorkloadClient({ initialWorkload }: { initialWorkload: EmployeeWorkload[] }) {
  const queryClient = useQueryClient();
  const [sortKey, setSortKey] = useState<SortKey>("activeJobs");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const query = useQuery({
    queryKey: ["employee-workload"],
    queryFn: () => listEmployeeWorkload(),
    initialData: initialWorkload,
    refetchInterval: 30_000,
  });

  useRealtimeChannel(CHANNELS.production, () => queryClient.invalidateQueries({ queryKey: ["employee-workload"] }));
  useRealtimeChannel(CHANNELS.materialRequests, () =>
    queryClient.invalidateQueries({ queryKey: ["employee-workload"] })
  );

  const workload = query.data ?? initialWorkload;

  const sorted = useMemo(() => {
    return [...workload].sort((a, b) => {
      const aVal = a[sortKey] ?? -1;
      const bVal = b[sortKey] ?? -1;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [workload, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employee Workload</h1>
        <p className="text-sm text-muted-foreground">Click a column to sort · {workload.length} employees</p>
      </div>

      {workload.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Gauge className="size-6" />
          </div>
          <p className="text-sm text-muted-foreground">No active employees yet.</p>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              {COLUMNS.map((col) => (
                <TableHead key={col.key}>
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    {col.label}
                    {sortKey === col.key &&
                      (sortDir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((w) => (
              <TableRow key={w.employeeId}>
                <TableCell className="font-medium text-foreground">{w.employeeName}</TableCell>
                <TableCell>{w.activeJobs}</TableCell>
                <TableCell>{w.queuedJobs}</TableCell>
                <TableCell>{w.completedToday}</TableCell>
                <TableCell>{formatMinutes(w.avgCompletionMinutes)}</TableCell>
                <TableCell>
                  {w.waitingMaterials > 0 ? (
                    <Badge variant="warning">{w.waitingMaterials}</Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell>
                  {w.delayedJobs > 0 ? (
                    <Badge variant="destructive">{w.delayedJobs}</Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
