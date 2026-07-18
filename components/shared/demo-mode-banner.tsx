import { FlaskConical } from "lucide-react";

export function DemoModeBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-xs font-semibold text-warning-foreground">
      <FlaskConical className="size-3.5" />
      Demo Mode — showing sample data, auth is bypassed, and writes are disabled
    </div>
  );
}
