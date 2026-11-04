import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Order forms upload their files inside the Server Action request.
      // Next's default 1MB cap rejected any normal phone photo with a bare
      // "error in the Server Components render" toast; this matches the
      // app's own ceiling (MAX_TOTAL_UPLOAD_BYTES, 4MB of files, in
      // lib/files/constants.ts) plus room for the form fields, and stays
      // under Netlify's ~4.5MB effective function payload.
      bodySizeLimit: "4.5mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
};

export default nextConfig;
