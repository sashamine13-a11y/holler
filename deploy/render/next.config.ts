import type { NextConfig } from "next";

/**
 * Конфигурация для Render static site.
 * Render отдаёт статику из корня домена, basePath НЕ нужен.
 */

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: false,
  typescript: { ignoreBuildErrors: true },
  trailingSlash: false,
};

export default nextConfig;
