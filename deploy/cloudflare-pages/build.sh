#!/bin/bash
# Скрипт сборки для Cloudflare Pages.
# Cloudflare Pages запускает этот скрипт и забирает ./out как output.
# Deploy command в настройках Cloudflare Pages должен быть ПУСТЫМ.

set -e

echo "=== Building for Cloudflare Pages ==="
echo "Node: $(node --version 2>/dev/null || echo 'not found')"
echo "Bun: $(bun --version 2>/dev/null || echo 'not found')"

# Шаг 1: Установка зависимостей
echo ""
echo "[1/5] Installing dependencies..."
# Используем обычный install (не frozen-lockfile) для надёжности
bun install 2>&1 | tail -5 || npm install 2>&1 | tail -5

# Шаг 2: Применяем конфигурацию Cloudflare
echo ""
echo "[2/5] Applying Cloudflare config (next.config.ts)..."
cp deploy/cloudflare-pages/next.config.ts next.config.ts

# Копируем _headers и _redirects в public/ — они попадут в /out
cp deploy/cloudflare-pages/_headers public/_headers
cp deploy/cloudflare-pages/_redirects public/_redirects
echo "  ✅ _headers and _redirects copied to public/"

# Шаг 3: Патчим client-app.tsx под статический хостинг
echo ""
echo "[3/5] Patching client-app.tsx for static hosting..."
node deploy/cloudflare-pages/patch-client.mjs

# Шаг 4: Удаляем API routes (несовместимы со static export)
echo ""
echo "[4/5] Removing API routes (incompatible with static export)..."
rm -rf src/app/api
echo "  ✅ API routes removed"

# Шаг 5: Сборка Next.js (статический экспорт)
echo ""
echo "[5/5] Building Next.js (static export)..."
# Используем next напрямую из node_modules/.bin, чтобы избежать проблем с npx
if [ -x "node_modules/.bin/next" ]; then
  ./node_modules/.bin/next build
elif command -v bunx >/dev/null 2>&1; then
  bunx next build
else
  npx next build
fi

# Проверка результата
echo ""
echo "=== Verifying output ==="
if [ -f out/index.html ]; then
  echo "✅ Build successful — output in ./out"
  echo "Files in out/:"
  ls -la out/ | head -15
  echo ""
  echo "Static assets:"
  ls out/_next/static/ 2>/dev/null | head -5 || echo "  (no _next/static)"
else
  echo "❌ Build failed — out/index.html not found"
  echo "Checking what was generated:"
  ls -la out/ 2>/dev/null || echo "  out/ directory does not exist"
  ls -la .next/ 2>/dev/null | head -5 || echo "  .next/ directory does not exist"
  exit 1
fi

echo ""
echo "=== Build complete ==="
