import Link from "next/link";
import { Plus, Users, PackageSearch, BarChart3, PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export function QuickActions({ onNewOrder }: { onNewOrder: () => void }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      <Button size="lg" variant="primary" onClick={onNewOrder} className="gap-2">
        <Plus className="size-4" />
        New Order
      </Button>
      <Button asChild size="lg" variant="outline" className="gap-2">
        <Link href="/employees">
          <Users className="size-4" />
          Employees
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="gap-2">
        <Link href="/material-requests">
          <PackageSearch className="size-4" />
          Material Requests
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="gap-2">
        <Link href="/reports">
          <BarChart3 className="size-4" />
          Monthly Reports
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="gap-2">
        <Link href="/completed-orders">
          <PackageCheck className="size-4" />
          Completed Orders
        </Link>
      </Button>
    </div>
  );
}
