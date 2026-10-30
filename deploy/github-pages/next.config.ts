import type { NextConfig } from "next";

/**
 * Конфигурация для GitHub Pages.
 *
 * GitHub Pages отдаёт статические файлы из ветки gh-pages по адресу
 * https://<user>.github.io/<repo>/, поэтому нужен basePath = '/holler'.
 *
 * Сборка: GitHub Actions workflow (.github/workflows/deploy.yml)
 * запускает build.sh и пушит папку out/ в ветку gh-pages.
 */

const repo = 'holler';

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: false,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  trailingSlash: true,
  // GitHub Pages: https://user.github.io/holler/
  basePath: `/${repo}`,
  assetPrefix: `/${repo}/`,
};

export default nextConfig;
