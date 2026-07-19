"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, FileStack, Layers, PackageCheck, Timer } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getCurrentMonthStats, listMonthlyStatistics, type CurrentMonthStats, type MonthlyStatisticItem } from "@/lib/actions/reports";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function formatMinutes(minutes: number | null): string {
  if (minutes == null) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function downloadCsv(rows: MonthlyStatisticItem[]) {
  const header = ["Month", "Total Orders", "Completed", "Delayed", "Avg Completion", "Most Used Paper", "Most Requested Material"];
  const lines = rows.map((r) =>
    [r.label, r.totalOrders, r.completedOrders, r.delayedOrders, formatMinutes(r.avgCompletionMinutes), r.mostUsedPaper ?? "", r.mostRequestedMaterial ?? ""]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "prime-production-monthly-report.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsClient({
  initialStats,
  initialCurrentMonth,
}: {
  initialStats: MonthlyStatisticItem[];
  initialCurrentMonth: CurrentMonthStats;
}) {
  const statsQuery = useQuery({
    queryKey: ["monthly-statistics"],
    queryFn: () => listMonthlyStatistics(),
    initialData: initialStats,
  });
  const currentMonthQuery = useQuery({
    queryKey: ["current-month-stats"],
    queryFn: () => getCurrentMonthStats(),
    initialData: initialCurrentMonth,
  });

  const monthly = statsQuery.data ?? initialStats;
  const current = currentMonthQuery.data ?? initialCurrentMonth;

  const trend = [...monthly]
    .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))
    .map((m) => ({
      name: m.label.split(" ")[0].slice(0, 3),
      Total: m.totalOrders,
      Completed: m.completedOrders,
      Delayed: m.delayedOrders,
    }));

  const latestMonthWithEmployees = monthly.find((m) => m.ordersPerEmployee.length > 0);
  const employeeChart = (latestMonthWithEmployees ?? current).ordersPerEmployee.map((e) => ({
    name: e.employeeName,
    Orders: e.count,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">{current.label} so far, plus monthly history</p>
        </div>
        <Button type="button" variant="outline" onClick={() => downloadCsv(monthly)} disabled={monthly.length === 0}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={FileStack} label="Orders This Month" value={current.totalOrders} tone="default" />
        <StatCard icon={PackageCheck} label="Completed" value={current.completedOrders} tone="success" />
        <StatCard icon={Layers} label="Delayed" value={current.delayedOrders} tone="danger" />
        <StatCard icon={Timer} label="Avg Completion Time" value={formatMinutes(current.avgCompletionMinutes)} tone="default" />
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-bold text-muted-foreground">Orders per Month</h2>
        {trend.length === 0 ? (
          <EmptyChart label="No monthly history yet — the first report generates at month-end." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }}
              />
              <Legend />
              <Bar dataKey="Total" fill="var(--color-secondary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Completed" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Delayed" fill="var(--color-destructive)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-bold text-muted-foreground">Orders per Employee</h2>
          {employeeChart.length === 0 ? (
            <EmptyChart label="No assignments recorded yet." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={employeeChart} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} width={100} />
                <Tooltip
                  contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }}
                />
                <Bar dataKey="Orders" fill="var(--color-secondary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-sm font-bold text-muted-foreground">This Month at a Glance</h2>
          <div className="grid grid-cols-2 gap-4">
            <InfoStat label="Most Used Paper" value={current.mostUsedPaper ?? "—"} />
            <InfoStat label="Most Requested Material" value={current.mostRequestedMaterial ?? "—"} />
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <span className="text-xs font-semibold text-muted-foreground">Monthly History</span>
            {monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground">No closed months yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {monthly.slice(0, 6).map((m) => (
                  <li key={`${m.year}-${m.month}`} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{m.label}</span>
                    <span className="text-muted-foreground">
                      {m.completedOrders}/{m.totalOrders} completed · {m.delayedOrders} delayed
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone: "default" | "success" | "danger";
}) {
  const toneClass =
    tone === "success" ? "bg-success/15 text-success" : tone === "danger" ? "bg-destructive/15 text-destructive" : "bg-secondary/15 text-secondary";
  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className={`flex size-8 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon className="size-4" />
      </div>
      <div>
        <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
        <div className="mt-1.5 text-xs leading-tight text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{label}</div>;
}
