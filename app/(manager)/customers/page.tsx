import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { listCustomers } from "@/lib/actions/customers";
import { CustomersClient } from "@/components/manager/customers-client";

export const metadata: Metadata = {
  title: "Customers — Prime Production Board",
};

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  await requireAdmin();
  const customers = await listCustomers();

  return <CustomersClient initialCustomers={customers} />;
}
