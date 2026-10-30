#!/bin/bash
# Сборка для GitHub Pages (через GitHub Actions).
# GitHub Actions запускает этот скрипт и пушит ./out в ветку gh-pages.

# Don't use set -e so we can see all output even on failure.
# Each step checks its own exit code.

echo "=== Building for GitHub Pages ==="
echo "Node: $(node --version 2>/dev/null || echo 'not found')"
echo "Bun: $(bun --version 2>/dev/null || echo 'not found')"
echo "Working dir: $(pwd)"

# Шаг 1: Установка зависимостей
echo ""
echo "[1/5] Installing dependencies..."
if ! bun install 2>&1; then
  echo "⚠️  bun install failed, falling back to npm install..."
  if ! npm install 2>&1; then
    echo "❌ All install methods failed"
    exit 1
  fi
fi
echo "✅ Dependencies installed"

# Шаг 2: Применяем конфигурацию GitHub Pages
echo ""
echo "[2/5] Applying GitHub Pages config (next.config.ts)..."
cp deploy/github-pages/next.config.ts next.config.ts

# Копируем .nojekyll чтобы GitHub Pages не игнорировал _next/
echo "nojekyll" > public/.nojekyll

# Шаг 3: Патчим client-app.tsx под статический хостинг
echo ""
echo "[3/5] Patching client-app.tsx for static hosting..."
if ! node deploy/cloudflare-pages/patch-client.mjs; then
  echo "❌ Patch script failed"
  exit 1
fi

# Шаг 4: Удаляем API routes (несовместимы со static export)
echo ""
echo "[4/5] Removing API routes (incompatible with static export)..."
rm -rf src/app/api
echo "  ✅ API routes removed"

# Шаг 5: Сборка Next.js (статический экспорт)
echo ""
echo "[5/5] Building Next.js (static export)..."
if [ -x "node_modules/.bin/next" ]; then
  NEXT_BIN="./node_modules/.bin/next"
elif command -v bunx >/dev/null 2>&1; then
  NEXT_BIN="bunx next"
else
  NEXT_BIN="npx next"
fi
echo "Using: $NEXT_BIN build"
if ! $NEXT_BIN build 2>&1; then
  echo "❌ Next.js build failed"
  exit 1
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
