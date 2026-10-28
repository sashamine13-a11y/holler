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
    // Три режима:
    // 1. Production на Render: NEXT_PUBLIC_WS_URL указывает на klasschat-ws сервис
    // 2. Dev на localhost:3000: напрямую к localhost:3003
    // 3. Preview через Caddy: тот же origin + XTransformPort=3003
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    const isLocalDev = typeof window !== 'undefined' && window.location.port === '3000';

    let socketInstance: ReturnType<typeof io>;
    if (wsUrl) {
      // Production на Render — подключаемся к отдельному WS-сервису
      socketInstance = io(wsUrl, {
        path: '/',
        transports: ['websocket', 'polling'],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1500,
        timeout: 10000,
      });
    } else if (isLocalDev) {
      // Локальная dev-разработка — напрямую к mini-service
      socketInstance = io('http://localhost:3003', {
        path: '/',
        transports: ['websocket', 'polling'],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1500,
        timeout: 10000,
      });
    } else {
      // Preview-среда через Caddy
      socketInstance = io({
        path: '/',
        transports: ['websocket', 'polling'],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1500,
        timeout: 10000,
        query: { XTransformPort: '3003' },
      });
    }

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
