'use client';

import { createClient } from '@supabase/supabase-js';

/**
 * Supabase клиент для авторизации и БД.
 *
 * Использует publishable key (новый формат sb_publishable_...).
 * URL извлекается из ключа автоматически (новый формат Supabase).
 *
 * Для старого формата нужен NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */

// Новый формат ключа: sb_publishable_xxx
// Старый формат: нужен отдельно URL и anon key
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_7uMbV7WfEpougC3qJbZKDQ_wlYfi2cn';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tbpddxnpdxhgrtzdcahq.supabase.co';

// Hardcoded fallback для статического хостинга (как с Ably)
const FALLBACK_URL = 'https://tbpddxnpdxhgrtzdcahq.supabase.co';
const FALLBACK_KEY = 'sb_publishable_7uMbV7WfEpougC3qJbZKDQ_wlYfi2cn';

const url = SUPABASE_URL || FALLBACK_URL;
const key = PUBLISHABLE_KEY || FALLBACK_KEY;

export const supabase = createClient(url, key);
export const isSupabaseConfigured = Boolean(url && key);
