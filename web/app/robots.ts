import type { MetadataRoute } from "next";

// Prototype with hackathon data: keep every crawler out.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
