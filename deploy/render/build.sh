#!/bin/bash
# Сборка для Render static site.
# Render отдаёт статику из папки, указанной в publishPath.
#
# Важно: НЕ используем patch-client.mjs, потому что:
# 1. Auth теперь через useAuth (localStorage + Ably) — не через /api/join
# 2. Real-time через Ably — NEXT_PUBLIC_ABLY_KEY задаётся в env
# 3. Коды доступа НЕ нужны (есть email+пароль auth)

set -e

echo "=== Building for Render ==="
echo "Node: $(node --version 2>/dev/null || echo 'not found')"

# Шаг 1: Установка зависимостей
echo ""
echo "[1/4] Installing dependencies..."
npm install 2>&1 | tail -3

# Шаг 2: Применяем конфигурацию для статического экспорта (basePath НЕ нужен для Render)
echo ""
echo "[2/4] Applying static export config..."
cp deploy/render/next.config.ts next.config.ts

# Шаг 3: Удаляем API routes (несовместимы со static export)
echo ""
echo "[3/4] Removing API routes (incompatible with static export)..."
rm -rf src/app/api
echo "  ✅ API routes removed"

# Шаг 4: Сборка Next.js (статический экспорт)
echo ""
echo "[4/4] Building Next.js (static export)..."
if [ -x "node_modules/.bin/next" ]; then
  ./node_modules/.bin/next build
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
