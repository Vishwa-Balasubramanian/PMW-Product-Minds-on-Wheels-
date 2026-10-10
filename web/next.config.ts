import type { NextConfig } from "next";

// We use the previous rendering model (no Cache Components): every page reads fresh data
// from SQLite on each request. Simpler for three people working in parallel.
const nextConfig: NextConfig = {
  cacheComponents: false,
  serverExternalPackages: ["better-sqlite3"],
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
