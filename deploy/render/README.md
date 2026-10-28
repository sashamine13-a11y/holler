# Деплой КлассChat на Render (динамический хостинг)

Render — это динамический хостинг с поддержкой WebSocket. Даёт **бесплатный тариф** для Web Services (засыпают через 15 мин простоя, просыпаются за ~30 сек).

## ✅ Что работает на Render (чего нет на Cloudflare Pages)

- ✅ **Server-side проверка кодов** — коды в секретах Render, не видны в JS-бандле
- ✅ **WebSocket real-time** — сообщения, опросы, голосования синхронизируются между устройствами
- ✅ **Список онлайн-участников** — реальный список тех, кто сейчас в сети
- ✅ **API `/api/join`** — настоящая серверная проверка с rate-limit
- ✅ **SQLite база** — данные хранятся на диске (1 ГБ бесплатно)

## Пошаговая инструкция

### 1. Создайте аккаунт на Render

Зайдите на https://render.com → Sign up (через GitHub проще всего)

### 2. Создайте Blueprint (один клик — два сервиса)

1. В dashboard нажмите **New +** → **Blueprint**
2. Выберите ваш GitHub-репозиторий `sashamine13-a11y/klasschat`
3. Render автоматически найдёт `render.yaml` и предложит создать два сервиса:
   - `klasschat` (web service — Next.js приложение)
   - `klasschat-ws` (private service — WebSocket)
4. Заполните секретные переменные (спросит при создании):
   - `CLASS_CODE` = `519284` (или ваш код)
   - `ADMIN_CODE` = `836471` (или ваш код)
5. Нажмите **Apply**

### 3. Дождитесь деплоя (~5-7 минут)

Render будет:
1. Клонировать репозиторий
2. Установить зависимости (`bun install`)
3. Собрать Next.js (`bun run build`)
4. Запустить оба сервиса

После успеха получите URL:
- `https://klasschat.onrender.com` — основной сайт
- WebSocket-сервис приватный, доступен только из основного приложения

### 4. Проверьте что всё работает

1. Откройте `https://klasschat.onrender.com`
2. Войдите с кодом `519284` (ученик) или `836471` (админ)
3. Откройте таб «Участники» в sidebar — вы увидите себя онлайн
4. Откройте сайт в двух вкладках — увидите, что участники синхронизируются
5. Отправьте сообщение в одной вкладке — оно появится во второй в реальном времени

## Лимиты бесплатного тарифа Render

- Web Services засыпают через 15 минут простоя
- Первое посещение после сна — ~30 секунд на пробуждение
- 750 часов/месяц (хватит на 1 сервис 24/7)
- 1 ГБ диска для SQLite

Если засыпание мешает — можно:
1. Заплатить $7/мес за всегда включённый сервис (Starter plan)
2. Настроить cron-job.org пинговать сайт каждые 14 минут (бесплатный workaround)

## Переменные окружения

Задаются в dashboard Render → сервис → Environment:

| Variable | Где | Значение |
|----------|-----|----------|
| `CLASS_CODE` | klasschat | `519284` (секрет) |
| `ADMIN_CODE` | klasschat | `836471` (секрет) |
| `DATABASE_URL` | klasschat | `file:/data/custom.db` |
| `NEXT_PUBLIC_WS_URL` | klasschat | авто (из klasschat-ws сервиса) |
| `PORT` | оба | авто (задаёт Render) |

## Локальная проверка перед деплоем

```bash
# Production-сборка
bun install
bun run build

# Запуск production-сервера
bun run start

# В отдельном терминале — WebSocket mini-service
cd mini-services/klasschat-ws
bun install
bun run start
```

Откройте http://localhost:3000

## Файлы

| Файл | Назначение |
|------|-----------|
| `render.yaml` | Render Blueprint — описывает оба сервиса |
| `next.config.ts` | Конфиг Next.js со `output: 'standalone'` |
| `package.json` scripts: `build`, `start` | Команды сборки и запуска |
| `mini-services/klasschat-ws/` | WebSocket mini-service |
| `src/app/api/join/route.ts` | Server-side проверка кодов |
| `src/hooks/use-socket.ts` | WebSocket-хук (3 режима: Render/dev/preview) |

## Сравнение с Cloudflare Pages

| | Cloudflare Pages | Render |
|---|---|---|
| Стоимость | Бесплатно | Бесплатно (с засыпанием) |
| Server-side API | ❌ | ✅ |
| WebSocket | ❌ | ✅ |
| Защита кодов | ❌ (видны в бандле) | ✅ (в секретах) |
| Real-time синхронизация | ❌ | ✅ |
| Список онлайн | ❌ | ✅ |
| Скорость | Очень быстро | Быстро |
| Надёжность | 99.99% | 99% |
