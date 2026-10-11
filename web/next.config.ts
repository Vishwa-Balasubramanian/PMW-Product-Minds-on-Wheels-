import fs from "node:fs";
import type { NextConfig } from "next";

// We use the previous rendering model (no Cache Components): every page reads fresh data
// from the database on each request. Simpler for three people working in parallel.
const nextConfig: NextConfig = {
  cacheComponents: false,
  serverExternalPackages: ["@libsql/client", "libsql"],
  poweredByHeader: false,
  // The header shows the official BMW logo only once someone adds the file (checked at build time).
  env: { NEXT_PUBLIC_HAS_BMW_LOGO: fs.existsSync("public/brand/bmw-logo.svg") ? "1" : "0" },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
