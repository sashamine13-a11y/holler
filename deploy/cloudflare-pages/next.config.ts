import type { NextConfig } from "next";

/**
 * Конфигурация для Cloudflare Pages (статический экспорт).
 *
 * Cloudflare Pages — это статический хостинг, поэтому:
 * - output: 'export' — генерирует статический HTML/JS/CSS в /out
 * - Нет server-side API routes (коды проверяются на клиенте через env)
 * - Нет WebSocket mini-service (нужен отдельный хостинг, если требуется real-time)
 *
 * Для сборки: NEXT_PUBLIC_CLASS_CODE и NEXT_PUBLIC_ADMIN_CODE
 * задаются как переменные окружения в Cloudflare Pages dashboard.
 */

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // Статический экспорт для Cloudflare Pages
  output: "export",
  // Cloudflare Pages отдаёт статику из корня, images.unoptimized обязателен
  images: {
    unoptimized: true,
  },
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  // Отключаем trailing slash для чистых URL
  trailingSlash: false,
};

export default nextConfig;
