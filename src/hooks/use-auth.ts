'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'member' | 'admin';
  avatar?: string;
}

/**
 * Хук авторизации через Supabase.
 *
 * Возвращает:
 *  - user: текущий пользователь (null если не залогинен)
 *  - loading: идёт загрузка сессии
 *  - signIn(email, password)
 *  - signUp(email, password, name)
 *  - signInWithGoogle()
 *  - signOut()
 *  - isConfigured: настроен ли Supabase
 *
 * Если Supabase не настроен (нет env) — возвращает isConfigured=false,
 * и приложение может показать fallback (например, старый join screen).
 */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Получаем текущую сессию
    supabase.auth.getSession().then(({ data }: { data: { session: { user: User } | null } }) => {
      if (data.session?.user) {
        setUser(transformUser(data.session.user));
      }
      setLoading(false);
    });

    // Подписка на изменения сессии
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: string, session: { user: User | null }) => {
        if (session?.user) {
          setUser(transformUser(session.user));
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    if (!supabase) return { error: 'Auth not configured' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: translateError(error.message) };
    return {};
  };

  const signUp = async (email: string, password: string, name: string): Promise<{ error?: string }> => {
    if (!supabase) return { error: 'Auth not configured' };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) return { error: translateError(error.message) };
    // Если email confirmation включён — пользователь получит письмо
    if (data.user && !data.session) {
      return { error: 'Check your email to confirm registration' };
    }
    return {};
  };

  const signInWithGoogle = async (): Promise<{ error?: string }> => {
    if (!supabase) return { error: 'Auth not configured' };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (error) return { error: translateError(error.message) };
    return {};
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  };

  return {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    isConfigured: isSupabaseConfigured,
  };
}

function transformUser(u: User): AuthUser {
  const meta = (u.user_metadata || {}) as { name?: string; avatar_url?: string; full_name?: string; picture?: string };
  return {
    id: u.id,
    email: u.email || '',
    name: meta.name || meta.full_name || (u.email ? u.email.split('@')[0] : 'User'),
    role: 'member', // по умолчанию member; админ-права можно выдавать через БД
    avatar: meta.avatar_url || meta.picture,
  };
}

function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Invalid email or password';
  if (m.includes('user already registered')) return 'User with this email already exists';
  if (m.includes('password should be at least')) return 'Password must be at least 6 characters';
  if (m.includes('unable to validate email')) return 'Invalid email format';
  if (m.includes('email not confirmed')) return 'Please confirm your email first';
  return msg;
}
