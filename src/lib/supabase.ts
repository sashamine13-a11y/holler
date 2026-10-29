'use client';

import { createClient } from '@supabase/supabase-js';

/**
 * Supabase клиент для авторизации и БД.
 *
 * Ключи и URL hardcoded как fallback для статического хостинга
 * (GitHub Pages, Render — где envVars могут не подхватиться).
 *
 * Эти ключи безопасны для клиента:
 *  - PUBLISHABLE key — публичный, защищён RLS
 *  - URL — публичный
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://favnquxkqqidnfrbxndn.supabase.co';
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_7uMbV7WfEpougC3qJbZKDQ_wlYfi2cn';

export const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY);
export const isSupabaseConfigured = Boolean(SUPABASE_URL && PUBLISHABLE_KEY);
