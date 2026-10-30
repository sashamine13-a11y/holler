#!/bin/bash
# Сборка для GitHub Pages (через GitHub Actions).
# GitHub Actions запускает этот скрипт и пушит ./out в ветку gh-pages.

set -e

echo "=== Building for GitHub Pages ==="
echo "Node: $(node --version 2>/dev/null || echo 'not found')"
echo "Bun: $(bun --version 2>/dev/null || echo 'not found')"

# Шаг 1: Установка зависимостей
echo ""
echo "[1/5] Installing dependencies..."
# Use pipefail so the exit code reflects bun install, not tail.
set -o pipefail
if ! bun install 2>&1 | tail -10; then
  echo "⚠️  bun install failed, falling back to npm install..."
  npm install 2>&1 | tail -10
fi
set +o pipefail

# Шаг 2: Применяем конфигурацию GitHub Pages
echo ""
echo "[2/5] Applying GitHub Pages config (next.config.ts)..."
cp deploy/github-pages/next.config.ts next.config.ts

# Копируем .nojekyll чтобы GitHub Pages не игнорировал _next/
echo "nojekyll" > public/.nojekyll

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
  ls -la out/ | head -10
else
  echo "❌ Build failed — out/index.html not found"
  exit 1
fi
