'use client';

import { useEffect, useState, useRef } from 'react';
import Ably from 'ably';

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
 * Real-time хук на базе Ably (managed service).
 *
 * Использует единый канал 'holler:all' для всех событий — проще, чем
 * подписка на каждую комнату отдельно. Ably масштабируется до тысяч
 * сообщений в секунду на бесплатном тарифе.
 *
 * Сохраняет интерфейс useSocket() для совместимости с client-app.tsx:
 *   - socket.emit(event, data) → publish в 'holler:all'
 *   - socket.on(event, cb) → subscribe на 'holler:all' с фильтрацией по event
 *   - isConnected
 *   - onlineMembers (через Ably Presence API)
 *
 * Нужен env: NEXT_PUBLIC_ABLY_KEY (client API key)
 *
 * Каналы Ably:
 *   - holler:all — все события (message:new, poll:new, poll:vote, pin:update)
 *   - holler:presence — presence (онлайн-участники)
 */
export function useSocket({ user }: UseSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [onlineMembers, setOnlineMembers] = useState<OnlineMember[]>([]);
  const clientRef = useRef<Ably.Realtime | null>(null);
  const allChannelRef = useRef<Ably.RealtimeChannel | null>(null);
  // event → Set<{cb, handler}>
  const subscriptionsRef = useRef<Map<string, Set<{
    cb: (payload: unknown) => void;
    handler: (msg: Ably.Message) => void;
  }>>>(new Map());

  useEffect(() => {
    if (!user) return;
    const ablyKey = process.env.NEXT_PUBLIC_ABLY_KEY;
    if (!ablyKey) {
      console.warn('[Holler] NEXT_PUBLIC_ABLY_KEY not set — real-time disabled');
      return;
    }

    const ably = new Ably.Realtime({ key: ablyKey, clientId: user.id });
    clientRef.current = ably;

    const onConnected = () => setIsConnected(true);
    const onDisconnected = () => setIsConnected(false);

    ably.connection.on('connected', onConnected);
    ably.connection.on('disconnected', onDisconnected);
    ably.connection.on('suspended', onDisconnected);

    // Канал для всех событий
    const allChannel = ably.channels.get('holler:all');
    allChannelRef.current = allChannel;

    // Presence
    const presenceChannel = ably.channels.get('holler:presence');

    const refreshMembers = async () => {
      try {
        const members = await presenceChannel.presence.get();
        setOnlineMembers(members.map((m: Ably.PresenceMessage) => m.data as OnlineMember));
      } catch (err) {
        console.error('[Holler] presence get failed:', err);
      }
    };

    presenceChannel.presence.subscribe('enter', refreshMembers);
    presenceChannel.presence.subscribe('leave', refreshMembers);
    presenceChannel.presence.subscribe('update', refreshMembers);

    presenceChannel.presence.enterClient(user.id, {
      userId: user.id,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      joinedAt: Date.now(),
    }).then(refreshMembers).catch((err: unknown) => {
      console.error('[Holler] presence enter failed:', err);
    });

    return () => {
      ably.connection.off('connected', onConnected);
      ably.connection.off('disconnected', onDisconnected);
      ably.connection.off('suspended', onDisconnected);
      try { presenceChannel.presence.leaveClient(user.id); } catch {}
      ably.close();
      clientRef.current = null;
      allChannelRef.current = null;
      subscriptionsRef.current.clear();
      setIsConnected(false);
      setOnlineMembers([]);
    };
  }, [user?.id]);

  /**
   * Socket.IO-совместимый API поверх Ably.
   * Все события публикуются в единый канал 'holler:all'.
   * Подписки фильтруются по event name.
   */
  const socket = {
    emit: (event: string, data: unknown) => {
      const channel = allChannelRef.current;
      if (!channel) return;
      channel.publish(event, data);
    },

    on: (event: string, cb: (payload: unknown) => void) => {
      const channel = allChannelRef.current;
      if (!channel) return;

      const handler = (msg: Ably.Message) => {
        // Фильтруем по event name
        if (msg.name === event) {
          cb(msg.data);
        }
      };

      channel.subscribe(handler);

      // Сохраняем для отписки
      if (!subscriptionsRef.current.has(event)) {
        subscriptionsRef.current.set(event, new Set());
      }
      subscriptionsRef.current.get(event)!.add({ cb, handler });

      // Сохраняем handler на самом cb для off()
      (cb as unknown as { __ablyHandler?: (msg: Ably.Message) => void }).__ablyHandler = handler;
    },

    off: (event: string, cb: (payload: unknown) => void) => {
      const channel = allChannelRef.current;
      if (!channel) return;

      const handler = (cb as unknown as { __ablyHandler?: (msg: Ably.Message) => void }).__ablyHandler;
      if (handler) {
        try { channel.unsubscribe(handler); } catch {}
      }

      const subs = subscriptionsRef.current.get(event);
      if (subs) {
        for (const s of subs) {
          if (s.cb === cb) {
            subs.delete(s);
            break;
          }
        }
        if (subs.size === 0) subscriptionsRef.current.delete(event);
      }
    },
  };

  return { socket, isConnected, onlineMembers };
}
