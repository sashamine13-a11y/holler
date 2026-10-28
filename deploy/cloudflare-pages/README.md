# Деплой КлассChat на Cloudflare Pages через GitHub

Бесплатный хостинг навсегда: безлимитный трафик, 500 билдов/мес, глобальный CDN, SSL.

## ⚠️ Ограничения статического хостинга

Cloudflare Pages — это **статический хостинг** (без сервера). Поэтому:

1. **Коды класса/админа будут видны в JS-бандле.** Любой пользователь найдёт их в DevTools.
   Это компромисс — для реальной защиты нужен Cloudflare Workers (тоже бесплатно, 100k запросов/день).
   См. ниже раздел «Как сделать настоящую защиту».

2. **WebSocket mini-service не работает.** Real-time синхронизация между устройствами недоступна.
   Сообщения живут только в `localStorage` текущего браузера.

3. **API `/api/join` удалён при сборке.** Проверка кода происходит на клиенте через
   `NEXT_PUBLIC_*` env-переменные.

## Пошаговая инструкция

### 1. Создайте GitHub-репозиторий

```bash
cd /home/z/my-project

# Инициализация git (если ещё не)
git init
git add .
git commit -m "КлассChat — статическая версия для Cloudflare Pages"
git branch -M main
```

Создайте репозиторий на GitHub (например, `klasschat`), затем:
```bash
git remote add origin https://github.com/ВАШ_ЛОГИН/klasschat.git
git push -u origin main
```

### 2. Подключите Cloudflare Pages

1. Зайдите на https://pages.cloudflare.com → Sign in
2. **Create a project** → **Connect to Git**
3. Авторизуйте GitHub, выберите репозиторий `klasschat`
4. Заполните настройки билда:

| Поле | Значение |
|------|----------|
| Framework preset | None |
| Build command | `bash deploy/cloudflare-pages/build.sh` |
| Build output directory | `out` |
| Root directory | (оставьте пустым) |

5. Добавьте **Environment variables** (критично!):

| Variable name | Value | Type |
|---------------|-------|------|
| `NEXT_PUBLIC_CLASS_CODE` | `519284` *(или ваш код)* | Plaintext |
| `NEXT_PUBLIC_ADMIN_CODE` | `836471` *(или ваш код)* | Plaintext |
| `NODE_VERSION` | `20` | Plaintext |

> 💡 **Смените коды** на свои перед деплоем, чтобы они не совпадали с публичными из этого репо.

6. **Save and Deploy**

### 3. Дождитесь билда (~2-3 минуты)

Cloudflare покажет логи в реальном времени. После успеха получите URL:
```
https://klasschat-xyz.pages.dev
```

### 4. (Опционально) Свой домен

Settings → **Custom domains** → **Set up a custom domain**. SSL выдаётся автоматически.

---

## Локальная проверка перед пушем

```bash
# Установите env-переменные
export NEXT_PUBLIC_CLASS_CODE=519284
export NEXT_PUBLIC_ADMIN_CODE=836471

# Запустите билд-скрипт
bash deploy/cloudflare-pages/build.sh

# Проверьте результат локально
cd out && python3 -m http.server 8888
# Откройте http://localhost:8888
```

---

## Как сделать настоящую защиту кодов (Cloudflare Worker)

Если не хотите, чтобы коды были в JS-бандле:

### 1. Создайте Worker

1. Зайдите на https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Worker**
2. Назовите `klasschat-api`, нажмите Deploy
3. Откройте редактор кода, вставьте:

```javascript
export default {
  async fetch(request, env) {
    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const { code, name } = await request.json();

    // Защита от перебора (in-memory, на один isolated instance)
    // Для серьёзной защиты используйте KV или Durable Objects
    if (!code || !name) {
      return Response.json({ ok: false, error: 'Некорректные данные' }, { status: 400 });
    }

    // Коды берутся из секретов Worker (Settings → Variables)
    const isClass = code === env.CLASS_CODE;
    const isAdmin = code === env.ADMIN_CODE;

    if (!isClass && !isAdmin) {
      return Response.json({ ok: false, error: 'Неверный код класса' }, { status: 401 });
    }

    return Response.json({
      ok: true,
      user: { name: name.slice(0, 32), role: isAdmin ? 'admin' : 'member', iat: Date.now() },
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  },
};
```

4. В **Settings → Variables** добавьте:
   - `CLASS_CODE` = `519284` (тип **Secret**)
   - `ADMIN_CODE` = `836471` (тип **Secret**)

5. Получите URL вида `https://klasschat-api.ваш-логин.workers.dev`

### 2. Измените клиент

В `src/lib/client-join.ts` замените функцию `joinClass`:

```typescript
export async function joinClass(code: string, name: string): Promise<JoinResult> {
  try {
    const res = await fetch('https://klasschat-api.ваш-логин.workers.dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'Ошибка входа' };
    }
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, error: 'Сеть недоступна' };
  }
}
```

Теперь коды в секретах Worker, а в клиентском бандле их нет.

---

## Файлы в этой папке

| Файл | Назначение |
|------|-----------|
| `next.config.ts` | Конфиг Next.js для статического экспорта (`output: 'export'`) |
| `_headers` | Security-заголовки (CSP, HSTS, X-Frame-Options и т.д.) |
| `_redirects` | SPA-fallback для клиентского роутинга Next.js |
| `client-join.ts` | Клиентская проверка кодов (вместо server-side API) |
| `patch-client.mjs` | Скрипт патча `client-app.tsx` под статический хостинг |
| `build.sh` | Основной билд-скрипт для Cloudflare Pages |
| `README.md` | Этот файл |

---

## Что НЕ работает на статическом хостинге

- ❌ API `/api/join` — заменено клиентской проверкой
- ❌ WebSocket mini-service (`mini-services/klasschat-ws/`) — нет сервера
- ❌ Real-time синхронизация между устройствами — только `localStorage`
- ❌ Список онлайн-участников — sidebar покажет «нет связи»

Что работает:
- ✅ Все каналы, чаты, опросы, анонимные вопросы, закрепы
- ✅ Тёмная/светлая тема
- ✅ Все анимации
- ✅ Inline-валидация входа
- ✅ Поиск по комнатам
- ✅ Все security-заголовки
