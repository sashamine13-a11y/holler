'use client';

import { useState } from 'react';

export interface OnlineMember {
  userId: string;
  name: string;
  role: 'member' | 'admin';
  avatar?: string;
  joinedAt: number;
}

interface UseSocketOptions {
  user: { id: string; name: string; role: 'member' | 'admin'; avatar?: string } | null;
}

/**
 * STUB для статического хостинга (Cloudflare Pages).
 * Real-time не работает — WebSocket mini-service недоступен.
 *
 * Возвращает:
 *  - socket: null (нет real-time)
 *  - isConnected: false
 *  - onlineMembers: [] (пустой список)
 *  - on: no-op функция
 *
 * Чтобы включить real-time, нужен Vercel + Ably (см. README.md).
 */
export function useSocket({ user }: UseSocketOptions) {
  const [socket] = useState<null>(null);
  const [isConnected] = useState(false);
  const [onlineMembers] = useState<OnlineMember[]>([]);

  return { socket, isConnected, onlineMembers };
}
