'use client';

import { useEffect, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';

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
 * WebSocket-хук для реального времени.
 * Подключается к mini-service на порту 3003 через Caddy-шлюз.
 *
 * Возвращает:
 *  - socket (для emit-ов)
 *  - isConnected
 *  - onlineMembers (список онлайн-участников)
 *  - on<T>(event, cb) — подписка на события
 */
export function useSocket({ user }: UseSocketOptions) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineMembers, setOnlineMembers] = useState<OnlineMember[]>([]);

  useEffect(() => {
    if (!user) return;

    // Подключаемся к WebSocket mini-service.
    // В проде (через Caddy) — используем тот же origin + query XTransformPort=3003.
    // В dev (напрямую к Next.js на :3000) — fallback на ws://localhost:3003.
    const isDev = typeof window !== 'undefined' && window.location.port === '3000';
    const socketInstance = isDev
      ? io('http://localhost:3003', {
          path: '/',
          transports: ['websocket', 'polling'],
          forceNew: true,
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1500,
          timeout: 10000,
        })
      : io({
          path: '/',
          transports: ['websocket', 'polling'],
          forceNew: true,
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1500,
          timeout: 10000,
          query: { XTransformPort: '3003' },
        });

    setSocket(socketInstance);

    const onConnect = () => {
      setIsConnected(true);
      // После подключения идентифицируем себя
      socketInstance.emit('identify', {
        userId: user.id,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      });
    };

    const onDisconnect = () => setIsConnected(false);

    const onMembersUpdate = (data: { members: OnlineMember[] }) => {
      if (Array.isArray(data?.members)) {
        setOnlineMembers(data.members);
      }
    };

    socketInstance.on('connect', onConnect);
    socketInstance.on('disconnect', onDisconnect);
    socketInstance.on('members-update', onMembersUpdate);

    return () => {
      socketInstance.off('connect', onConnect);
      socketInstance.off('disconnect', onDisconnect);
      socketInstance.off('members-update', onMembersUpdate);
      socketInstance.disconnect();
      setSocket(null);
      setIsConnected(false);
      setOnlineMembers([]);
    };
  }, [user?.id]);

  // Универсальный подписчик. Возвращает функцию отписки.
  const on = useCallback(<T = unknown>(event: string, cb: (payload: T) => void) => {
    if (!socket) return () => {};
    const handler = (payload: T) => cb(payload);
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [socket]);

  return { socket, isConnected, onlineMembers, on };
}
