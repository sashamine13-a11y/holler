#!/bin/bash
# Сборка для Render static site.
# Render отдаёт статику из папки, указанной в publishPath (out).

set -e

echo "=== Building for Render ==="

# Шаг 1: Установка зависимостей
echo "[1/3] Installing dependencies..."
npm install

# Шаг 2: Применяем конфигурацию для статического экспорта
echo "[2/3] Applying static export config..."
cp deploy/render/next.config.ts next.config.ts

# Удаляем API routes (несовместимы со static export)
rm -rf src/app/api

# Шаг 3: Сборка Next.js (статический экспорт)
echo "[3/3] Building Next.js..."
npx next build

# Проверка результата
if [ -f out/index.html ]; then
  echo "✅ Build successful"
else
  echo "❌ Build failed"
  exit 1
fi
