import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Production Board TV — Prime Printing Co.",
};

export default function TvLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 overflow-hidden">{children}</div>;
}
