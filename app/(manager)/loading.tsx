import { Loader2 } from "lucide-react";

export default function ManagerLoading() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
