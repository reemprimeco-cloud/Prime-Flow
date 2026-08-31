import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Production Board TV — Prime Printing Co.",
};

export default function TvLayout({ children }: { children: React.ReactNode }) {
  // Most TVs (and Android TV/streaming-stick browsers, e.g. a Mi TV Stick)
  // overscan by design -- they crop a few percent off every edge of
  // whatever's rendered, assuming broadcast content already left a safe
  // margin there. This board didn't, so on real hardware the outer
  // columns/cards get clipped exactly at the edge. `3vmin` keeps that
  // margin proportional on any screen size/aspect ratio (vmin = the
  // smaller of viewport width/height, the standard unit for this).
  return <div className="fixed inset-0 overflow-hidden bg-background p-[3vmin]">{children}</div>;
}
