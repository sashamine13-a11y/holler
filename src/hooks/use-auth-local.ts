'use client';

import { useEffect, useState } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'member' | 'admin';
  avatar?: string;
}

interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  role: 'member' | 'admin';
  avatar?: string;
  createdAt: number;
}

const USERS_KEY = 'holler_users';
const SESSION_KEY = 'holler_session';

/**
 * Browser-based auth with localStorage.
 *
 * Не требует сервера — все данные хранятся в localStorage браузера.
 * Пароли хешируются через PBKDF2 (Web Crypto API).
 *
 * Ограничения:
 *  - Пользователи НЕ синхронизируются между устройствами
 *    (нужно регистрироваться на каждом устройстве отдельно)
 *  - Real-time сообщения РАБОТАЮТ между устройствами (через Ably)
 *  - Не подходит для production с чувствительными данными
 *
 * Для настоящей защиты нужен Supabase/Worker, но это работает без регистрации.
 */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const session = localStorage.getItem(SESSION_KEY);
      if (session) {
        const parsed = JSON.parse(session) as AuthUser;
        setUser(parsed);
      }
    } catch {}
    setLoading(false);
  }, []);

  const signUp = async (email: string, password: string, name: string): Promise<{ error?: string }> => {
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

    // Проверяем, нет ли уже такого пользователя
    const users = getUsers();
    if (users.find(u => u.email === cleanEmail)) {
      return { error: 'User with this email already exists' };
    }

    // Хешируем пароль
    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    const newUser: StoredUser = {
      id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      email: cleanEmail,
      name: cleanName,
      passwordHash,
      salt,
      role: 'member',
      createdAt: Date.now(),
    };

    users.push(newUser);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));

    // Создаём сессию
    const authUser: AuthUser = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      avatar: newUser.avatar,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(authUser));
    setUser(authUser);

    return {};
  };

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      return { error: 'Please fill in all fields' };
    }

    const users = getUsers();
    const stored = users.find(u => u.email === cleanEmail);
    if (!stored) {
      return { error: 'Invalid email or password' };
    }

    const passwordHash = await hashPassword(password, stored.salt);
    if (passwordHash !== stored.passwordHash) {
      return { error: 'Invalid email or password' };
    }

    const authUser: AuthUser = {
      id: stored.id,
      email: stored.email,
      name: stored.name,
      role: stored.role,
      avatar: stored.avatar,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(authUser));
    setUser(authUser);

    return {};
  };

  const signInWithGoogle = async (): Promise<{ error?: string }> => {
    return { error: 'Google OAuth requires server setup. Use email/password.' };
  };

  const signOut = async () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    isConfigured: true, // всегда настроен (использует localStorage)
  };
}

// ============================================================================
// Helpers
// ============================================================================

function getUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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
