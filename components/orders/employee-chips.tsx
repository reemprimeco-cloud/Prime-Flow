import { Users } from "lucide-react";

interface EmployeeChipsProps {
  employees: { id: string; fullName: string }[];
  max?: number;
}

export function EmployeeChips({ employees, max = 3 }: EmployeeChipsProps) {
  if (employees.length === 0) {
    return <span className="text-xs text-muted-foreground">Unassigned</span>;
  }

  const shown = employees.slice(0, max);
  const overflow = employees.length - shown.length;

  return (
    <div className="flex items-center gap-1.5">
      <Users className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="flex flex-wrap items-center gap-1">
        {shown.map((employee) => (
          <span
            key={employee.id}
            className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
          >
            {employee.fullName}
          </span>
        ))}
        {overflow > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
}
