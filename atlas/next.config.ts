import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/atlas",
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd(), "..", ".."),
};

export default nextConfig;
