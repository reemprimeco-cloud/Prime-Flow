import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { listArchivedOrders } from "@/lib/actions/archive";
import { ArchiveClient } from "@/components/manager/archive-client";

export const metadata: Metadata = {
  title: "Archive — Prime Production Board",
};

export default async function ArchivePage() {
  await requireAdmin();
  const orders = await listArchivedOrders();

  return <ArchiveClient orders={orders} />;
}
