import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { listMaterialRequests } from "@/lib/actions/material-requests";
import { MaterialRequestsClient } from "@/components/manager/material-requests-client";

export const metadata: Metadata = {
  title: "Material Requests — Prime Production Board",
};

export const dynamic = "force-dynamic";

export default async function MaterialRequestsPage() {
  await requireAdmin();
  const requests = await listMaterialRequests();

  return <MaterialRequestsClient initialRequests={requests} />;
}
