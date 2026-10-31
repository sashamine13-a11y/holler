'use client';

import { useEffect, useState } from 'react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'member' | 'admin' | 'dev';
  avatar?: string;
  username?: string;
}

/**
 * Auth через Supabase (server-side).
 *
 * - Email + пароль регистрация/вход
 * - Сессия через Supabase JWT (cookies)
 * - Профиль автоматически создаётся в таблице profiles (через trigger)
 * - Восстановление пароля через секретный вопрос/ответ (хранится в profiles)
 */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Получаем текущую сессию (with timeout so loading doesn't hang on bad network)
    let cancelled = false;
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) => {
      setTimeout(() => resolve({ data: { session: null } }), 10000);
    });
    Promise.race([sessionPromise, timeoutPromise])
      .then((res: { data: { session: Session | null } }) => {
        if (cancelled) return;
        if (res.data.session?.user) {
          loadProfile(res.data.session.user);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });

    // Подписка на изменения сессии
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session?.user) {
          loadProfile(session.user);
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function loadProfile(authUser: User) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profile) {
        setUser({
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role || 'member',
          avatar: profile.avatar,
          username: profile.username,
        });
      } else {
        // Профиль ещё не создан — используем данные из auth
        setUser({
          id: authUser.id,
          email: authUser.email || '',
          name: (authUser.user_metadata?.name as string) || (authUser.email ? authUser.email.split('@')[0] : 'User'),
          role: 'member',
        });
      }
    } catch (err) {
      console.error('[Holler] Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  }

  const signUp = async (
    email: string,
    password: string,
    name: string,
    secretQuestion?: string,
    secretAnswer?: string
  ): Promise<{ error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanEmail || !password || !cleanName) {
      return { error: 'Please fill in all fields' };
    }
    if (password.length < 6) {
      return { error: 'Password must be at least 6 characters' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { error: 'Invalid email format' };
    }

    const result = await withTimeout(supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { name: cleanName } },
    }), 15000);

    if (result.error) return { error: translateError(result.error.message) };

    const data = result.data;
    // Если email confirmation включён (auto_confirm trigger должен предотвращать это)
    if (data?.user && !data.session) {
      return { error: 'Check your email to confirm registration' };
    }

    // Сохраняем секретный вопрос в profile (если указан)
    if (data?.user && secretQuestion && secretAnswer) {
      const salt = generateSalt();
      const answerHash = await hashPassword(secretAnswer.trim().toLowerCase(), salt);
      await supabase.from('profiles').update({
        secret_question: secretQuestion,
        secret_answer_hash: answerHash,
        secret_answer_salt: salt,
      }).eq('id', data.user.id);
    }

    return {};
  };

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      return { error: 'Please fill in all fields' };
    }

    const result = await withTimeout(
      supabase.auth.signInWithPassword({ email: cleanEmail, password }),
      15000,
    );
    if (result.error) return { error: translateError(result.error.message) };

    return {};
  };

  const signInWithGoogle = async (): Promise<{ error?: string }> => {
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
    await supabase.auth.signOut();
    setUser(null);
  };

  // Восстановление пароля через секретный вопрос
  const getSecretQuestion = async (email: string): Promise<string | null> => {
    const cleanEmail = email.trim().toLowerCase();
    const { data } = await supabase
      .from('profiles')
      .select('secret_question')
      .eq('email', cleanEmail)
      .single();
    return data?.secret_question || null;
  };

  const resetPassword = async (
    email: string,
    secretAnswer: string,
    newPassword: string
  ): Promise<{ error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanAnswer = secretAnswer.trim().toLowerCase();

    if (!cleanEmail || !cleanAnswer || !newPassword) {
      return { error: 'Please fill in all fields' };
    }
    if (newPassword.length < 6) {
      return { error: 'Password must be at least 6 characters' };
    }

    // Получаем profile с хешем ответа
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, secret_answer_hash, secret_answer_salt')
      .eq('email', cleanEmail)
      .single();

    if (!profile) {
      return { error: 'User not found' };
    }
    if (!profile.secret_answer_hash || !profile.secret_answer_salt) {
      return { error: 'No secret question set for this user' };
    }

    // Проверяем ответ
    const answerHash = await hashPassword(cleanAnswer, profile.secret_answer_salt);
    if (answerHash !== profile.secret_answer_hash) {
      return { error: 'Wrong answer to secret question' };
    }

    // Отправляем email для сброса пароля (Supabase не позволяет менять пароль
    // неавторизованному клиенту напрямую; секретный вопрос только верифицирует
    // личность, после чего шлём стандартную ссылку сброса).
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });

    if (resetError) {
      return { error: translateError(resetError.message) };
    }

    return { error: 'Password reset email sent. Check your inbox.' };
  };

  return {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    isConfigured: isSupabaseConfigured,
    getSecretQuestion,
    resetPassword,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function generateSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(derived))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Invalid email or password';
  if (m.includes('user already registered')) return 'User with this email already exists';
  if (m.includes('password should be at least')) return 'Password must be at least 6 characters';
  if (m.includes('unable to validate email')) return 'Invalid email format';
  if (m.includes('email not confirmed')) return 'Please confirm your email first';
  if (m.includes('timeout') || m.includes('aborted') || m.includes('network')) {
    return 'Network error — check your connection and try again';
  }
  return msg;
}

interface TimedOut {
  data: null;
  error: { message: string };
}

/**
 * Race a promise against a timeout. The promise is expected to resolve to a
 * Supabase-shaped `{ data, error }` object. On timeout, returns
 * `{ data: null, error: { message: 'timeout' } }`. Prevents auth calls from
 * hanging indefinitely on bad networks (e.g. Supabase blocked from some regions).
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | TimedOut> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<TimedOut>((resolve) => {
    timer = setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
