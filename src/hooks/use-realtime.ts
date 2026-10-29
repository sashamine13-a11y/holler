'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Ably from 'ably';

export interface OnlineMember {
  userId: string;
  name: string;
  role: 'member' | 'admin';
  avatar?: string;
  joinedAt: number;
}

interface UseRealtimeOptions {
  user: { id: string; name: string; role: 'member' | 'admin'; avatar?: string } | null;
}

/**
 * Real-time хук на базе Ably.
 * Заменяет Socket.IO mini-service — Ably это managed-сервис,
 * работает на Vercel/Cloudflare Pages без своего сервера.
 *
 * Возможности:
 *  - Publish/subscribe на сообщения, опросы, голосования, закрепы
 *  - Presence API для списка онлайн-участников
 *  - Автоматическое переподключение
 *
 * Нужен env: NEXT_PUBLIC_ABLY_KEY (client API key, не root!)
 */
export function useRealtime({ user }: UseRealtimeOptions) {
  const [client, setClient] = useState<Ably.Realtime | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineMembers, setOnlineMembers] = useState<OnlineMember[]>([]);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user) return;
    const ablyKey = process.env.NEXT_PUBLIC_ABLY_KEY;
    if (!ablyKey) {
      console.warn('[Holler] NEXT_PUBLIC_ABLY_KEY not set — real-time disabled');
      return;
    }

    const ably = new Ably.Realtime({ key: ablyKey, clientId: user.id });
    setClient(ably);

    const onConnected = () => setIsConnected(true);
    const onDisconnected = () => setIsConnected(false);

    ably.connection.on('connected', onConnected);
    ably.connection.on('disconnected', onDisconnected);
    ably.connection.on('suspended', onDisconnected);

    // Presence-канал для онлайн-участников
    const presenceChannel = ably.channels.get('holler:presence');

    presenceChannel.presence.subscribe('enter', async () => {
      const members = await presenceChannel.presence.get();
      setOnlineMembers(members.map((m: Ably.PresenceMessage) => m.data as OnlineMember));
    });
    presenceChannel.presence.subscribe('leave', async () => {
      const members = await presenceChannel.presence.get();
      setOnlineMembers(members.map((m: Ably.PresenceMessage) => m.data as OnlineMember));
    });
    presenceChannel.presence.subscribe('update', async () => {
      const members = await presenceChannel.presence.get();
      setOnlineMembers(members.map((m: Ably.PresenceMessage) => m.data as OnlineMember));
    });

    // Входим в presence
    presenceChannel.presence.enterClient(user.id, {
      userId: user.id,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      joinedAt: Date.now(),
    }).then(async () => {
      const members = await presenceChannel.presence.get();
      setOnlineMembers(members.map((m: Ably.PresenceMessage) => m.data as OnlineMember));
    }).catch((err: unknown) => console.error('[Holler] presence enter failed:', err));

    channelRef.current = presenceChannel;

    return () => {
      ably.connection.off('connected', onConnected);
      ably.connection.off('disconnected', onDisconnected);
      ably.connection.off('suspended', onDisconnected);
      try { presenceChannel.presence.leaveClient(user.id); } catch {}
      ably.close();
      setClient(null);
      setIsConnected(false);
      setOnlineMembers([]);
    };
  }, [user?.id]);

  /**
   * Publish event to a room channel.
   * Channel name format: `holler:room:<roomId>`
   */
  const publish = useCallback(<T = unknown>(roomId: string, event: string, data: T) => {
    if (!client) return;
    const channelName = `holler:room:${roomId}`;
    const channel = client.channels.get(channelName);
    channel.publish(event, data);
  }, [client]);

  /**
   * Subscribe to events on a room channel.
   * Returns unsubscribe function.
   */
  const subscribe = useCallback(<T = unknown>(roomId: string, event: string, cb: (payload: T) => void) => {
    if (!client) return () => {};
    const channelName = `holler:room:${roomId}`;
    const channel = client.channels.get(channelName);
    const handler = (msg: Ably.Message) => cb(msg.data as T);
    channel.subscribe(event, handler);
    return () => {
      channel.unsubscribe(event, handler);
    };
  }, [client]);

  /**
   * Subscribe to global events (e.g. pin updates across rooms).
   */
  const subscribeGlobal = useCallback(<T = unknown>(event: string, cb: (payload: T) => void) => {
    if (!client) return () => {};
    const channel = client.channels.get('holler:global');
    const handler = (msg: Ably.Message) => cb(msg.data as T);
    channel.subscribe(event, handler);
    return () => {
      channel.unsubscribe(event, handler);
    };
  }, [client]);

  /**
   * Publish global event.
   */
  const publishGlobal = useCallback(<T = unknown>(event: string, data: T) => {
    if (!client) return;
    const channel = client.channels.get('holler:global');
    channel.publish(event, data);
  }, [client]);

  return { isConnected, onlineMembers, publish, subscribe, publishGlobal, subscribeGlobal };
}
