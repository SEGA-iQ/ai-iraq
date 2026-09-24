import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Anthropic SDK and the JSON store use Node APIs; keep them out of the bundle.
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
