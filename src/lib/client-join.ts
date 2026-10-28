/**
 * Client-side code verification for static hosting (Cloudflare Pages).
 *
 * WARNING: On static hosting there's no server, so codes are checked on the client
 * via NEXT_PUBLIC_* env variables. This means codes ARE visible in the JS bundle —
 * anyone can find them in DevTools. This is NOT real security.
 *
 * For real protection, use a Cloudflare Worker or Vercel Function.
 *
 * Env variables (set in Cloudflare Pages dashboard):
 * - NEXT_PUBLIC_CLASS_CODE — regular user code (member role)
 * - NEXT_PUBLIC_ADMIN_CODE — admin code (admin role)
 *
 * Uses constant-time comparison to mitigate timing attacks (weak on client).
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
  // Simulate network delay for UX
  await new Promise(resolve => setTimeout(resolve, 300));

  const cleanName = (name || '').trim().slice(0, 32);
  if (!cleanName) {
    return { ok: false, error: 'Enter your name' };
  }

  const classCode = process.env.NEXT_PUBLIC_CLASS_CODE || '';
  const adminCode = process.env.NEXT_PUBLIC_ADMIN_CODE || '';

  if (!classCode || !adminCode) {
    return { ok: false, error: 'Server not configured' };
  }

  const isClass = safeEqual(code, classCode);
  const isAdmin = safeEqual(code, adminCode);

  if (!isClass && !isAdmin) {
    return { ok: false, error: 'Invalid access code' };
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
