/**
 * Клиентская проверка кода класса для статического хостинга (Cloudflare Pages).
 *
 * ВНИМАНИЕ: это компромисс. На статическом хостинге нет сервера, поэтому
 * коды проверяются на клиенте через NEXT_PUBLIC_* env-переменные.
 * Это означает, что коды видны в JS-бандле — любой пользователь может их
 * найти в DevTools. Это НЕ настоящая безопасность.
 *
 * Для реальной защиты нужен serverless-бэкенд:
 * - Cloudflare Workers (бесплатно, 100k запросов/день)
 * - Vercel Functions
 * - Supabase Edge Functions
 *
 * Переменные окружения (задаются в Cloudflare Pages dashboard):
 * - NEXT_PUBLIC_CLASS_CODE — код класса (роль member)
 * - NEXT_PUBLIC_ADMIN_CODE — код админа (роль admin)
 *
 * Используйте timingSafeEqual-подобную проверку (через constant-time comparison)
 * чтобы минимизировать timing-атаки, хотя на клиенте это слабая защита.
 */

function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export interface JoinResult {
  ok: boolean;
  user?: { name: string; role: 'member' | 'admin'; iat: number };
  error?: string;
}

export async function joinClass(code: string, name: string): Promise<JoinResult> {
  // Имитация сетевой задержки для UX
  await new Promise(resolve => setTimeout(resolve, 300));

  const cleanName = (name || '').trim().slice(0, 32);
  if (!cleanName) {
    return { ok: false, error: 'Введите имя' };
  }

  const classCode = process.env.NEXT_PUBLIC_CLASS_CODE || '';
  const adminCode = process.env.NEXT_PUBLIC_ADMIN_CODE || '';

  if (!classCode || !adminCode) {
    return { ok: false, error: 'Сервер не настроен' };
  }

  const isClass = safeEqual(code, classCode);
  const isAdmin = safeEqual(code, adminCode);

  if (!isClass && !isAdmin) {
    return { ok: false, error: 'Неверный код класса' };
  }

  return {
    ok: true,
    user: {
      name: cleanName,
      role: isAdmin ? 'admin' : 'member',
      iat: Date.now(),
    },
  };
}
