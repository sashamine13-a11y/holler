#!/bin/bash
# Скрипт сборки для Cloudflare Pages.
# Cloudflare Pages запускает этот скрипт и забирает ./out как output.

set -e

echo "=== Building for Cloudflare Pages ==="

# Устанавливаем зависимости
echo "[1/4] Installing dependencies..."
bun install --frozen-lockfile

# Копируем конфигурацию Cloudflare в корень
echo "[2/4] Applying Cloudflare config..."
cp deploy/cloudflare-pages/next.config.ts next.config.ts

# Копируем _headers и _redirects в public/ (чтобы они попали в /out)
cp deploy/cloudflare-pages/_headers public/_headers
cp deploy/cloudflare-pages/_redirects public/_redirects

# Патчим client-app.tsx: заменяем fetch('/api/join') на client-side joinClass
# Это делает коды публичными, но для статического хостинга это необходимо.
node deploy/cloudflare-pages/patch-client.mjs

# Удаляем API routes (несовместимы со static export)
echo "[2.5/4] Removing API routes (incompatible with static export)..."
rm -rf src/app/api
echo "✅ API routes removed"

# Собираем (используем напрямую next build, без standalone-копирования)
echo "[3/4] Building Next.js (static export)..."
npx next build

echo "[4/4] Verifying output..."
if [ -f out/index.html ]; then
  echo "✅ Build successful — output in ./out"
  ls -la out/ | head -10
else
  echo "❌ Build failed — out/index.html not found"
  exit 1
fi
