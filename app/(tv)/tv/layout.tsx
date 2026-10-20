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
  //
  // The background color (#82b1c8) is sampled directly from the light
  // blue accent in the Prime logo (the "i" dot / "PRINTING CO." text in
  // public/logo.jpg) -- a TV-only accent, not the app-wide --secondary
  // token, since every other screen stays on the white/light theme.
  //
  // The board is laid out on a 96 × 54rem canvas (16:9), and the root font
  // size is set so that canvas fills the screen: 20px at 1080p, 13.3px at
  // 720p, 10px on a stick browser that reports 960×540. Every rem-based
  // size below scales with it, so the board reads the same from across the
  // room whatever resolution the TV's browser runs at -- instead of fixed
  // pixel text that was tiny at 1080p and truncated on narrower hardware.
  return (
    <>
      <style>{"html{font-size:min(calc(100vh / 54), calc(100vw / 96))}"}</style>
      <div className="fixed inset-0 overflow-hidden bg-[#82b1c8] p-[3vmin]">{children}</div>
    </>
  );
}
