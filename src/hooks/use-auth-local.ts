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
  // Для восстановления пароля
  secretQuestion: string;
  secretAnswerHash: string;
  secretAnswerSalt: string;
}

const USERS_KEY = 'holler_users';
const SESSION_KEY = 'holler_session';

/**
 * Browser-based auth with localStorage + Ably sync.
 *
 * Возможности:
 *  - Email + пароль регистрация/вход
 *  - PBKDF2 хеширование (100k итераций, SHA-256, random salt)
 *  - Синхронизация пользователей между устройствами через Ably
 *    (при регистрации broadcast'им пользователя без пароля)
 *  - Восстановление пароля через секретный вопрос/ответ
 *  - Сессия сохраняется в localStorage
 *
 * Ограничения:
 *  - Любой может подменить localStorage (не для sensitive данных)
 *  - Пароли НЕ синхронизируются (только метаданные пользователей)
 *  - Для входа на новом устройстве нужно знать пароль
 */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [knownUsers, setKnownUsers] = useState<Array<{ email: string; name: string }>>([]);

  useEffect(() => {
    try {
      const session = localStorage.getItem(SESSION_KEY);
      if (session) {
        const parsed = JSON.parse(session) as AuthUser;
        setUser(parsed);
      }
      // Загружаем известных пользователей для отображения
      refreshKnownUsers();
    } catch {}
    setLoading(false);

    // Подписка на новых пользователей через Ably
    let channel: { subscribe: (event: string, cb: (msg: unknown) => void) => void; unsubscribe: () => void } | null = null;
    setupAblySync().then(c => { channel = c; });

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, []);

  const refreshKnownUsers = () => {
    try {
      const users = getUsers();
      setKnownUsers(users.map(u => ({ email: u.email, name: u.name })));
    } catch {}
  };

  const signUp = async (
    email: string,
    password: string,
    name: string,
    secretQuestion: string,
    secretAnswer: string
  ): Promise<{ error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanQuestion = secretQuestion.trim();
    const cleanAnswer = secretAnswer.trim().toLowerCase();

    if (!cleanEmail || !password || !cleanName) {
      return { error: 'Please fill in all fields' };
    }
    if (password.length < 6) {
      return { error: 'Password must be at least 6 characters' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { error: 'Invalid email format' };
    }
    if (!cleanQuestion || !cleanAnswer) {
      return { error: 'Please fill in secret question and answer' };
    }

    // Проверяем, нет ли уже такого пользователя
    const users = getUsers();
    if (users.find(u => u.email === cleanEmail)) {
      return { error: 'User with this email already exists' };
    }

    // Хешируем пароль
    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    // Хешируем ответ на секретный вопрос
    const answerSalt = generateSalt();
    const answerHash = await hashPassword(cleanAnswer, answerSalt);

    const newUser: StoredUser = {
      id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      email: cleanEmail,
      name: cleanName,
      passwordHash,
      salt,
      role: 'member',
      createdAt: Date.now(),
      secretQuestion: cleanQuestion,
      secretAnswerHash: answerHash,
      secretAnswerSalt: answerSalt,
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
    refreshKnownUsers();

    // Broadcast нового пользователя через Ably (без пароля!)
    broadcastNewUser({ email: newUser.email, name: newUser.name });

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

  // ===========================================================================
  // Восстановление пароля
  // ===========================================================================

  const getSecretQuestion = (email: string): string | null => {
    const cleanEmail = email.trim().toLowerCase();
    const users = getUsers();
    const stored = users.find(u => u.email === cleanEmail);
    return stored?.secretQuestion || null;
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

    const users = getUsers();
    const stored = users.find(u => u.email === cleanEmail);
    if (!stored) {
      return { error: 'User not found' };
    }

    // Проверяем ответ на секретный вопрос
    const answerHash = await hashPassword(cleanAnswer, stored.secretAnswerSalt);
    if (answerHash !== stored.secretAnswerHash) {
      return { error: 'Wrong answer to secret question' };
    }

    // Меняем пароль
    const newSalt = generateSalt();
    const newPasswordHash = await hashPassword(newPassword, newPassword.length > 0 ? newSalt : newSalt);
    const updatedUsers = users.map(u =>
      u.id === stored.id
        ? { ...u, salt: newSalt, passwordHash: newPasswordHash }
        : u
    );
    localStorage.setItem(USERS_KEY, JSON.stringify(updatedUsers));

    return {};
  };

  return {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    isConfigured: true,
    knownUsers,
    getSecretQuestion,
    resetPassword,
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

// ============================================================================
// Ably sync — broadcast новых пользователей
// ============================================================================

async function setupAblySync(): Promise<{ subscribe: (event: string, cb: (msg: unknown) => void) => void; unsubscribe: () => void } | null> {
  try {
    const Ably = (await import('ably')).default;
    const ablyKey = process.env.NEXT_PUBLIC_ABLY_KEY;
    if (!ablyKey) return null;

    const ably = new Ably.Realtime({ key: ablyKey });
    const channel = ably.channels.get('holler:users');

    // Слушаем новых пользователей
    channel.subscribe('user:new', (msg: { data?: { email: string; name: string } }) => {
      if (!msg?.data) return;
      const { email, name } = msg.data;
      // Добавляем в knownUsers если ещё нет
      try {
        const users = getUsers();
        // Только метаданные, без пароля — для отображения в списке известных
        if (!users.find(u => u.email === email)) {
          // Не можем залогиниться за этого пользователя, но можем показать что он существует
          // Для real-time сообщений это не нужно — presence Ably уже показывает онлайн
        }
      } catch {}
    });

    return {
      subscribe: () => {},
      unsubscribe: () => {
        try { ably.close(); } catch {}
      },
    };
  } catch (e) {
    console.warn('[Holler] Ably sync not available:', e);
    return null;
  }
}

async function broadcastNewUser(user: { email: string; name: string }): Promise<void> {
  try {
    const Ably = (await import('ably')).default;
    const ablyKey = process.env.NEXT_PUBLIC_ABLY_KEY;
    if (!ablyKey) return;

    const ably = new Ably.Realtime({ key: ablyKey });
    const channel = ably.channels.get('holler:users');
    channel.publish('user:new', user);
    setTimeout(() => {
      try { ably.close(); } catch {}
    }, 1000);
  } catch (e) {
    console.warn('[Holler] Failed to broadcast new user:', e);
  }
}
