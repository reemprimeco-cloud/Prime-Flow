import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { Providers } from "@/app/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prime Production Board",
  description: "Prime Printing Co. — Production Control Center",
  applicationName: "Prime Board",
  // Drives iOS's "Add to Home Screen" behaviour: launches without Safari's
  // address bar/toolbar, with a translucent status bar the header sits
  // under (hence the safe-area padding in globals.css).
  appleWebApp: {
    capable: true,
    title: "Prime Board",
    statusBarStyle: "default",
  },
  formatDetection: {
    // Stops iOS auto-linking order numbers and dates as phone numbers,
    // which turns them blue mid-sentence on cards.
    telephone: false,
    date: false,
    address: false,
  },
};

export const viewport: Viewport = {
  // `cover` lets the page paint edge to edge behind the Dynamic Island and
  // home indicator; `env(safe-area-inset-*)` in globals.css then keeps the
  // actual content clear of them.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays available (never disable it — it's an accessibility
  // requirement); the 16px input rule in globals.css is what stops iOS
  // from auto-zooming on field focus.
  themeColor: "#0a1f44",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background text-foreground">
        <Providers>
          <OfflineBanner />
          {children}
          <Toaster theme="light" position="top-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
