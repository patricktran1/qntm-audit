import type { MetadataRoute } from "next";

/**
 * Reports, the lead form, and every internal surface stay out of search
 * indexes. The internal area is additionally gated in middleware — this file
 * is politeness, not protection.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/audit"],
      disallow: ["/results", "/talk", "/demo", "/internal", "/api"],
    },
  };
}
