"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EMPLOYEE_NEXT_ACTIONS } from "@/types/domain";
import type { OrderStatus } from "@/types/database.types";

const SUCCESS_TARGETS: OrderStatus[] = ["ready_pickup", "ready_delivery", "collected", "delivered"];

interface StatusActionsProps {
  status: OrderStatus;
  pending: boolean;
  onChange: (status: OrderStatus) => void;
}

export function StatusActions({ status, pending, onChange }: StatusActionsProps) {
  const actions = EMPLOYEE_NEXT_ACTIONS[status] ?? [];
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2.5">
      {actions.map((action) => (
        <Button
          key={action.status}
          type="button"
          size="lg"
          variant={SUCCESS_TARGETS.includes(action.status) ? "success" : "primary"}
          disabled={pending}
          onClick={() => onChange(action.status)}
          className="min-w-[168px] flex-1 sm:flex-none"
        >
          {pending && <Loader2 className="animate-spin" />}
          {action.label}
        </Button>
      ))}
    </div>
  );
}
