# Деплой КлассChat — динамический хостинг БЕЗ банковской карты

## 🥇 Вариант 1: Railway (рекомендуется)

**Регистрация:** https://railway.app → Login with GitHub

### Плюсы
- ✅ Регистрация через GitHub (1 клик, без карты)
- ✅ WebSocket, server-side API, SQLite
- ✅ Простой деплой из репозитория

### Минусы
- ⚠️ Бесплатно только $5 кредита в месяц (хватит на ~3 недели 24/7)
- После исчерпания — нужно ждать следующий месяц или добавить карту

### Инструкция
1. Откройте https://railway.app → **Login with GitHub**
2. Authorize Railway в GitHub
3. В dashboard нажмите **New Project** → **Deploy from GitHub repo**
4. Выберите `sashamine13-a11y/klasschat`
5. Railway найдёт `railway.json` и создаст 2 сервиса
6. В каждом сервисе добавьте Variables:
   - `CLASS_CODE` = `519284`
   - `ADMIN_CODE` = `836471`
7. Дождитесь деплоя (~5 минут)
8. Получите URL: `https://klasschat.up.railway.app`

---

## 🥈 Вариант 2: Glitch (полностью бесплатно навсегда)

**Регистрация:** https://glitch.com → Sign up (через GitHub, Google, или email)

### Плюсы
- ✅ Полностью бесплатно навсегда, без карты
- ✅ WebSocket, server-side Node.js
- ✅ Простая регистрация

### Минусы
- ⚠️ Сервис засыпает через 5 минут простоя
- ⚠️ Лимит 200 МБ диска
- ⚠️ Медленнее Railway

### Инструкция
1. Откройте https://glitch.com → Sign up
2. Нажмите **New Project** → **Import from GitHub**
3. Вставьте: `https://github.com/sashamine13-a11y/klasschat`
4. В файле `.env` добавьте:
   ```
   CLASS_CODE=519284
   ADMIN_CODE=836471
   ```
5. В `package.json` измените start script на `next start` (Glitch запускает `npm start`)
6. Получите URL: `https://ваш-проект.glitch.me`

---

## 🥉 Вариант 3: Vercel + Cloudflare Workers (real-time)

**Регистрация:** https://vercel.com → Sign up with GitHub

### Плюсы
- ✅ Регистрация через GitHub
- ✅ Vercel Hobby — бесплатно навсегда, без карты
- ✅ Serverless API functions работают
- ✅ Очень быстрый CDN

### Минусы
- ❌ WebSocket не работает на Vercel (нужен внешний хост)
- ⚠️ Придётся использовать Cloudflare Workers Durable Objects для real-time

### Инструкция
1. Откройте https://vercel.com → **Sign up with GitHub**
2. **Add New** → **Project** → выберите `klasschat` репо
3. Vercel автоматически определит Next.js
4. В **Environment Variables** добавьте:
   - `CLASS_CODE` = `519284`
   - `ADMIN_CODE` = `836471`
5. **Deploy** — готово через 2 минуты
6. URL: `https://klasschat-xxx.vercel.app`

> ⚠️ На Vercel **не будет real-time синхронизации и списка онлайн-участников**.
> WebSocket нужно поднимать отдельно (например, на Glitch или Railway).

---

## Сравнение вариантов

| | Railway | Glitch | Vercel |
|---|---|---|---|
| Регистрация | GitHub | Email/GitHub | GitHub |
| Карта | ❌ не нужна | ❌ не нужна | ❌ не нужна |
| Server-side API | ✅ | ✅ | ✅ |
| WebSocket | ✅ | ✅ | ❌ |
| Real-time sync | ✅ | ✅ | ❌ |
| Онлайн-участники | ✅ | ✅ | ❌ |
| Бесплатно навсегда | ⚠️ $5/мес | ✅ | ✅ |
| Засыпание | Нет | 5 мин | Serverless |
| Скорость | Быстро | Медленно | Очень быстро |

---

## Файлы

| Файл | Назначение |
|------|-----------|
| `railway.json` | Конфиг для Railway (2 сервиса) |
| `render.yaml` | Конфиг для Render (если получится зарегаться) |
| `deploy/cloudflare-pages/` | Статический хостинг (бэкап вариант) |
| `deploy/render/README.md` | Инструкция для Render |
