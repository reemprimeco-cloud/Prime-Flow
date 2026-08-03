import type { MetadataRoute } from "next";

/**
 * Makes the board installable via Safari's "Add to Home Screen" — once
 * installed, `display: "standalone"` launches it without Safari's address
 * bar or toolbar, which is most of what makes a web app read as native on
 * an iPhone. Paired with the `appleWebApp` metadata and safe-area handling
 * in app/layout.tsx; see docs/ARCHITECTURE.md.
 *
 * iOS ignores most of this file (it reads the apple-* meta tags instead)
 * but Android/Chrome use it, and the icons here drive the install prompt
 * on both.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prime Production Board",
    short_name: "Prime Board",
    description: "Prime Printing Co. — Production Control Center",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0a1f44",
    icons: [
      { src: "/logo.jpg", sizes: "192x192", type: "image/jpeg", purpose: "any" },
      { src: "/logo.jpg", sizes: "512x512", type: "image/jpeg", purpose: "any" },
    ],
  };
}
