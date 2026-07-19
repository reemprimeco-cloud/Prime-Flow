"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, ListChecks } from "lucide-react";

import {
  getMyJobs,
  handOffJob,
  updateEmployeeJobStatus,
  type EmployeeJobItem,
  type MyJobsResult,
} from "@/lib/actions/employee-jobs";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime-channel";
import { CHANNELS } from "@/lib/realtime/constants";
import { EmployeeTopBar } from "@/components/employee/employee-top-bar";
import { JobCard } from "@/components/employee/job-card";
import { QueueCard } from "@/components/employee/queue-card";
import { Card } from "@/components/ui/card";

const AddNoteDialog = dynamic(() => import("@/components/employee/add-note-dialog").then((m) => m.AddNoteDialog), {
  ssr: false,
});
const RequestMaterialDialog = dynamic(
  () => import("@/components/employee/request-material-dialog").then((m) => m.RequestMaterialDialog),
  { ssr: false }
);
import { ORDER_STATUS_LABELS } from "@/types/domain";
import type { OrderStatus } from "@/types/database.types";

interface EmployeeDashboardClientProps {
  initialJobs: MyJobsResult;
  fullName: string;
}

export function EmployeeDashboardClient({ initialJobs, fullName }: EmployeeDashboardClientProps) {
  const queryClient = useQueryClient();

  const jobsQuery = useQuery({
    queryKey: ["my-jobs"],
    queryFn: () => getMyJobs(),
    initialData: initialJobs,
  });

  useRealtimeChannel(CHANNELS.production, () => {
    queryClient.invalidateQueries({ queryKey: ["my-jobs"] });
  });
  useRealtimeChannel(CHANNELS.materialRequests, () => {
    queryClient.invalidateQueries({ queryKey: ["my-jobs"] });
  });

  const [actioningId, setActioningId] = useState<string | null>(null);
  const [noteTarget, setNoteTarget] = useState<EmployeeJobItem | null>(null);
  const [materialTarget, setMaterialTarget] = useState<EmployeeJobItem | null>(null);

  const data = jobsQuery.data ?? initialJobs;

  const handleStatusChange = (job: EmployeeJobItem, status: OrderStatus) => {
    setActioningId(job.id);
    updateEmployeeJobStatus(job.id, status)
      .then(() => {
        toast.success(`${job.orderNumber} → ${ORDER_STATUS_LABELS[status]}`);
        queryClient.invalidateQueries({ queryKey: ["my-jobs"] });
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to update status"))
      .finally(() => setActioningId(null));
  };

  const handleHandOff = (job: EmployeeJobItem) => {
    setActioningId(job.id);
    handOffJob(job.id)
      .then(() => {
        toast.success(`${job.orderNumber} handed off${job.nextEmployeeName ? ` to ${job.nextEmployeeName}` : ""}`);
        queryClient.invalidateQueries({ queryKey: ["my-jobs"] });
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to hand off job"))
      .finally(() => setActioningId(null));
  };

  return (
    <div className="flex flex-col gap-8">
      <EmployeeTopBar
        fullName={fullName}
        assignedCount={data.active.length + data.queue.length}
        completedToday={data.completedToday}
        onRefresh={() => jobsQuery.refetch()}
        isRefreshing={jobsQuery.isFetching}
      />

      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ListChecks className="size-5 text-secondary" />
          My Active Jobs
        </h2>
        {data.active.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="size-6" />}
            title="No active jobs"
            description="Start a job from your queue below to see it here."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {data.active.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isOutsourced={data.isOutsourced}
                pending={actioningId === job.id}
                onStatusChange={(status) => handleStatusChange(job, status)}
                onHandOff={() => handleHandOff(job)}
                onAddNote={() => setNoteTarget(job)}
                onRequestMaterial={() => setMaterialTarget(job)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ClipboardList className="size-5 text-muted-foreground" />
          My Queue
        </h2>
        {data.queue.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title="Queue is empty"
            description="New assignments from your manager will show up here."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {data.queue.map((job, index) => (
              <QueueCard
                key={job.id}
                job={job}
                isNext={index === 0}
                pending={actioningId === job.id}
                onStart={() => handleStatusChange(job, "in_progress")}
              />
            ))}
          </div>
        )}
      </section>

      <AddNoteDialog
        open={!!noteTarget}
        onOpenChange={(open) => !open && setNoteTarget(null)}
        orderId={noteTarget?.id ?? null}
        orderNumber={noteTarget?.orderNumber}
      />
      <RequestMaterialDialog
        open={!!materialTarget}
        onOpenChange={(open) => !open && setMaterialTarget(null)}
        orderId={materialTarget?.id ?? null}
        orderNumber={materialTarget?.orderNumber}
      />
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">{icon}</div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </Card>
  );
}
