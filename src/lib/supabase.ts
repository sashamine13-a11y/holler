'use client';

import { createClient } from '@supabase/supabase-js';

/**
 * Supabase клиент для авторизации.
 *
 * Нужны env переменные (public, safe to expose):
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Получить бесплатно: https://app.supabase.com
 * 1. Sign up with GitHub
 * 2. New Project → подождать 2 мин
 * 3. Settings → API → Project URL, anon public key
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
