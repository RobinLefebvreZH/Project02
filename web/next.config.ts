import type { NextConfig } from "next";

// Two ways to build:
//  - npm run build       → normal Next.js app (Vercel), includes the /api/ipfs upload route.
//  - npm run build:ovh   → static files in `out/`, served from robin-lefebvre.com/erc-3643 on OVH.
//                          No server, so the IPFS upload route is left out.
const isStatic = process.env.STATIC_EXPORT === "true";
const basePath = process.env.BASE_PATH || undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath,
  // The API route is named route.api.ts so the static build can skip it.
  pageExtensions: isStatic ? ["tsx", "ts"] : ["tsx", "ts", "api.ts"],
  env: { NEXT_PUBLIC_UPLOADS_ENABLED: isStatic ? "false" : "true" },
  ...(isStatic ? { output: "export", trailingSlash: true, images: { unoptimized: true } } : {}),
};

export default nextConfig;
