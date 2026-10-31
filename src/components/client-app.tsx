'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { joinClass } from '@/lib/client-join';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useSocket } from '@/hooks/use-socket';
import { useAuth } from '@/hooks/use-auth';
import { AuthScreen } from '@/components/auth-screen';
import { Sidebar } from '@/components/sidebar';
import { MessageItem, PollCard, AnonCard } from '@/components/chat-panels';
import { Avatar } from '@/components/avatar';
import {
  AddRoomModal, AnonModal, CreateGroupModal, ForwardModal, NewDmModal, PollModal, UserProfileModal,
} from '@/components/modals';
import { RoomSettingsModal } from '@/components/room-settings';
import { SettingsModal } from '@/components/settings-modal';
import { useI18n } from '@/lib/i18n';
import { useLocalSettings, formatTimePref, WALLPAPER_PRESETS } from '@/lib/local-settings';
import {
  type DbRoom, type DbMessage, type DbProfile, type DbRoomMember, type ChannelComment,
  loadRooms, loadMessages, loadProfiles, loadRoom,
  browseChannels, joinChannel as apiJoinChannel, leaveRoom as apiLeaveRoom,
  insertMessage, softDeleteMessage as apiDeleteMessage, editMessage as apiEditMessage,
  findOrCreateDm, createGroup as apiCreateGroup,
  updateRoom as apiUpdateRoom, addRoomMembers as apiAddMembers, removeRoomMember as apiRemoveMember,
  pinMessageDb, loadPin, unpinDb,
  loadRoomPreviews, type RoomPreview,
  loadChannelComments, insertChannelComment, deleteChannelComment,
  subscribeToRoomMessages, subscribeToRooms, subscribeToPin, subscribeToRoomComments,
} from '@/lib/api';
import {
  AVATAR_MAX_BYTES, formatDateLabel, roomColor, safeDataUrl, sanitizeText, uid,
  MAX_ABOUT_LEN, MAX_MSG_LEN,
  type AnonQuestion, type Message, type Pinned, type Poll, type Role, type Room, type RoomKind, type User,
} from '@/lib/chat-types';
import {
  Send, Pin, BarChart3, EyeOff, Trash2,
  Menu as MenuIcon, ImagePlus, MessageSquare, MoreVertical, Settings as SettingsIcon,
  Megaphone, CheckCircle2, X, Users, ArrowDown, Flame, Mic, Lock,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

type ModalMode = 'addChannel' | 'poll' | 'anon' | 'createGroup' | 'forward' | 'newDm' | 'roomSettings' | 'settings' | null;

// ============================================================================
// Prefs — only UI state (rooms/messages live in Supabase)
// ============================================================================

const STORAGE_KEY = 'holler_v1';

interface Prefs {
  active: string;
  anon: boolean;
  seen?: Record<string, number>;
}

function loadPrefs(): Prefs {
  const base: Prefs = { active: '', anon: false };
  if (typeof window === 'undefined') return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      active: typeof p.active === 'string' ? p.active : '',
      anon: !!p.anon,
      seen: p.seen && typeof p.seen === 'object' ? p.seen : {},
    };
  } catch { return base; }
}

function savePrefs(p: Prefs): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

// ============================================================================
// Converters: DB rows → app types
// ============================================================================

function dbMsgToApp(m: DbMessage): Message {
  return {
    id: m.id,
    authorId: m.author_id ?? 'unknown',
    authorName: m.author_name,
    role: m.author_role === 'admin' ? 'admin' : m.author_role === 'dev' ? 'dev' : 'member',
    text: m.text ?? '',
    ts: new Date(m.created_at).getTime(),
    anon: m.is_anonymous,
    image: m.image ?? undefined,
    mediaType: m.media_type ?? undefined,
    replyTo: m.reply_to ?? undefined,
    forwardedFrom: m.forwarded_from ?? undefined,
    forwardedBy: m.forwarded_by ?? undefined,
    deletedAt: m.deleted_at ? new Date(m.deleted_at).getTime() : undefined,
    editedAt: m.edited_at ? new Date(m.edited_at).getTime() : undefined,
  };
}

function dbRoomToApp(r: DbRoom, myId: string, profiles: DbProfile[]): Room {
  const room: Room = {
    id: r.id,
    name: r.name,
    kind: r.kind,
    roomType: r.room_type,
    category: r.room_type === 'dm' ? 'dm' : r.room_type === 'group' ? 'group' : (r.category ?? undefined),
    about: r.about ?? undefined,
    messages: [],
    createdBy: r.created_by ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
  };
  if (r.room_type === 'dm') {
    const otherId = r.dm_user1 === myId ? r.dm_user2 : r.dm_user1;
    room.dmOtherUserId = otherId ?? undefined;
    const other = profiles.find(p => p.id === otherId);
    room.dmOtherName = other?.name;
    room.name = other?.name ?? r.name;
  }
  room.commentsEnabled = r.comments_enabled;
  return room;
}

// ============================================================================
// Main component
// ============================================================================

export default function ClientApp() {
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [active, setActive] = useState<string>(prefs.active ?? '');
  const [anon, setAnon] = useState<boolean>(prefs.anon);
  const [pinned, setPinned] = useState<Pinned | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [anonQs, setAnonQs] = useState<AnonQuestion[]>([]);
  const [profiles, setProfiles] = useState<DbProfile[]>([]);
  const [roomMemberships, setRoomMemberships] = useState<DbRoomMember[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [joinableChannels, setJoinableChannels] = useState<DbRoom[]>([]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [pendingImage, setPendingImage] = useState<string | undefined>();
  const [pendingMediaType, setPendingMediaType] = useState<'image' | 'video' | 'audio'>('image');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [editMsg, setEditMsg] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fromBottomRef = useRef(0);
  const lastTypingSentRef = useRef(0);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recCancelledRef = useRef(false);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Chat-list previews + typing indicators
  const [previews, setPreviews] = useState<Record<string, RoomPreview>>({});
  // Channel comments (message_id → list, oldest first) for the active channel
  const [channelComments, setChannelComments] = useState<Record<string, ChannelComment[]>>({});
  // Cache of loaded messages per room — survives room-list refreshes
  const messageCacheRef = useRef<Map<string, Message[]>>(new Map());
  const [typing, setTyping] = useState<Record<string, Record<string, { name: string; ts: number }>>>({});
  const [rec, setRec] = useState<{ on: boolean; secs: number }>({ on: false, secs: 0 });
  const [showJump, setShowJump] = useState(false);
  const [newBelow, setNewBelow] = useState(0);

  // i18n — global context (language switch works everywhere instantly)
  const { t, dateLocale } = useI18n();

  // Local UI / behavior preferences (accent, font, sound, privacy, per-room)
  const { settings, playSound, roomPrefs } = useLocalSettings();

  // Auth via Supabase
  const { user: authUser, loading: authLoading } = useAuth();

  // Sync auth user with our `user` state
  useEffect(() => {
    if (authUser) {
      setUser(prev => {
        if (prev && prev.id === authUser.id && prev.name === authUser.name && prev.username === authUser.username && prev.about === authUser.about) return prev;
        return {
          id: authUser.id,
          name: authUser.name,
          role: authUser.role,
          avatar: authUser.avatar,
          email: authUser.email,
          username: authUser.username,
          about: authUser.about,
        };
      });
    } else if (!authLoading) {
      setUser(null);
    }
  }, [authUser, authLoading]);

  // Ably presence / broadcast
  const { socket, isConnected, onlineMembers } = useSocket({ user });

  // Persist UI prefs only
  useEffect(() => {
    savePrefs({ active, anon, seen: prefs.seen });
  }, [active, anon, prefs]);

  // Mark the room as seen when opened / when a new message lands in it
  const markSeen = useCallback((roomId: string) => {
    if (!roomId) return;
    setPrefs(prev => {
      const seen = prev.seen ?? {};
      const last = seen[roomId] ?? 0;
      const now = Date.now();
      if (now - last < 4000) return prev;
      return { ...prev, seen: { ...seen, [roomId]: now } };
    });
  }, []);

  const activePreviewTs = active ? previews[active]?.ts : undefined;
  useEffect(() => {
    if (active) markSeen(active);
  }, [active, activePreviewTs, markSeen]);

  // Unread counter in the browser tab title
  useEffect(() => {
    const unreadRooms = rooms.filter(r => {
      const p = previews[r.id];
      return p && r.id !== active && p.ts > (prefs.seen?.[r.id] ?? 0);
    }).length;
    document.title = unreadRooms > 0 ? `(${unreadRooms}) Holler` : 'Holler';
  }, [rooms, previews, active, prefs.seen]);

  // Auto-scroll on new messages / room switch
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rooms, active]);

  // ===========================================================================
  // Load rooms + profiles once logged in
  // ===========================================================================
  const refreshRooms = useCallback(async () => {
    if (!user) return;
    try {
      const [{ rooms: dbRooms, memberships }, dbProfiles, joinable] = await Promise.all([
        loadRooms(user.id),
        loadProfiles(),
        browseChannels(user.id),
      ]);
      setProfiles(dbProfiles);
      setJoinableChannels(joinable);
      const appRooms = dbRooms.map(r => dbRoomToApp(r, user.id, dbProfiles));
      setRoomMemberships(memberships);
      // Preserve already-loaded messages — refresh can fire while reading.
      // messageCacheRef survives even when prev doesn't have the room yet
      // (race: loadMessages resolves before the first loadRooms).
      setRooms(prev => {
        const byId = new Map(prev.map(r => [r.id, r]));
        return appRooms.map(r => {
          const prevMsgs = byId.get(r.id)?.messages;
          return { ...r, messages: prevMsgs?.length ? prevMsgs : (messageCacheRef.current.get(r.id) ?? []) };
        });
      });
      // Chat-list previews
      loadRoomPreviews().then(list => {
        setPreviews(prev => {
          const next = { ...prev };
          for (const p of list) next[p.roomId] = p;
          return next;
        });
        // Baseline: don't mark history as unread on first login
        setPrefs(prev => {
          if (prev.seen && Object.keys(prev.seen).length > 0) return prev;
          const seen: Record<string, number> = {};
          for (const p of list) seen[p.roomId] = p.ts;
          return { ...prev, seen };
        });
      }).catch(() => {});
      setActive(prev => {
        if (prev && appRooms.some(r => r.id === prev)) return prev;
        return appRooms[0]?.id ?? '';
      });
    } catch (e) {
      console.warn('Failed to load rooms:', e);
    } finally {
      setLoadingRooms(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) refreshRooms();
    else { setRooms([]); setProfiles([]); setLoadingRooms(false); }
  }, [user, refreshRooms]);

  // Room list changes (new/deleted rooms, membership changes)
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToRooms(() => { refreshRooms(); });
    return unsub;
  }, [user, refreshRooms]);

  // ===========================================================================
  // Load messages for the active room + realtime inserts/updates.
  // Wait until the room list is loaded (loadingRooms=false) — otherwise
  // setRooms maps over an empty array and messages are lost until the user
  // switches rooms back and forth.
  // ===========================================================================
  useEffect(() => {
    if (!active || !user || loadingRooms) return;
    let cancelled = false;
    (async () => {
      // Ensure the Supabase session is hydrated before querying.
      // A query fired before session restore runs anonymously and RLS
      // silently returns an empty list (HTTP 200, []).
      const { supabase } = await import('@/lib/supabase');
      const { data: sessData } = await supabase.auth.getSession();
      if (!sessData.session) return;
      const dbMsgs = await loadMessages(active);
      if (cancelled) return;
      const appMsgs = dbMsgs.map(dbMsgToApp);
      messageCacheRef.current.set(active, appMsgs);
      setRooms(prev => prev.map(r => r.id === active ? { ...r, messages: appMsgs } : r));
      const pin = await loadPin(active);
      if (cancelled) return;
      setPinned(pin ? { room: active, messageId: pin.messageId ?? undefined, text: pin.text, ts: pin.ts } : null);
    })();
    const unsub = subscribeToRoomMessages(
      active,
      (dbMsg) => {
        const appMsg = dbMsgToApp(dbMsg);
        if (appMsg.authorId === user.id) return; // own messages arrive optimistically
        setRooms(prev => prev.map(r =>
          r.id === active ? { ...r, messages: [...r.messages, appMsg] } : r,
        ));
        pushPreview(active, appMsg);
        // Sound on receive — only if this room is not muted
        const rp = roomPrefs(active);
        if (!rp?.muted) playSound('receive');
        // Optional desktop notification
        if (settings.desktopNotifications && typeof Notification !== 'undefined' && Notification.permission === 'granted' && !rp?.muted) {
          try {
            const n = new Notification(`${appMsg.authorName}${appMsg.anon ? ' · anon' : ''}`, {
              body: appMsg.text || (appMsg.image ? '[attachment]' : ''),
              silent: true,
            });
            setTimeout(() => n.close(), 4000);
          } catch { /* ignore */ }
        }
        if (fromBottomRef.current > 400) setNewBelow(n => n + 1);
      },
      (dbMsg) => {
        const appMsg = dbMsgToApp(dbMsg);
        setRooms(prev => prev.map(r => {
          if (r.id !== active) return r;
          if (appMsg.deletedAt) {
            return { ...r, messages: r.messages.filter(m => m.id !== appMsg.id) };
          }
          return { ...r, messages: r.messages.map(m => m.id === appMsg.id ? appMsg : m) };
        }));
      },
    );
    const unsubPin = subscribeToPin(active, async () => {
      const pin = await loadPin(active);
      setPinned(pin ? { room: active, messageId: pin.messageId ?? undefined, text: pin.text, ts: pin.ts } : null);
    });
    return () => { cancelled = true; unsub(); unsubPin(); };
  }, [active, user, loadingRooms, roomPrefs, playSound, settings.desktopNotifications]);

  // Channel comments: load + realtime for the active channel
  useEffect(() => {
    if (!active || !user) return;
    const isActiveChannel = rooms.some(r => r.id === active && r.kind === 'channel');
    if (!isActiveChannel) {
      setChannelComments({});
      return;
    }
    let cancelled = false;
    loadChannelComments(active).then(list => {
      if (cancelled) return;
      const byMsg: Record<string, ChannelComment[]> = {};
      for (const c of list) (byMsg[c.message_id] ??= []).push(c);
      setChannelComments(byMsg);
    });
    const unsub = subscribeToRoomComments(
      active,
      (c) => setChannelComments(prev => {
        const list = prev[c.message_id] ?? [];
        if (list.some(x => x.id === c.id)) return prev;
        return { ...prev, [c.message_id]: [...list, c] };
      }),
      (id) => setChannelComments(prev => {
        const next: Record<string, ChannelComment[]> = {};
        for (const [mid, list] of Object.entries(prev)) next[mid] = list.filter(x => x.id !== id);
        return next;
      }),
    );
    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, user]);

  // Ably poll events
  useEffect(() => {
    if (!socket) return;
    const onPollNew = (payload: unknown) => {
      const p = payload as { poll?: Poll };
      if (!p?.poll) return;
      setPolls(prev => prev.find(x => x.id === p.poll!.id) ? prev : [...prev, p.poll!]);
    };
    const onPollVote = (payload: unknown) => {
      const p = payload as { pollId?: string; optionIndex?: number; voterId?: string };
      if (!p?.pollId || !p.voterId) return;
      setPolls(prev => prev.map(x => {
        if (x.id !== p.pollId) return x;
        if (x.options.some(o => o.votes.includes(p.voterId!))) return x;
        return { ...x, options: x.options.map((o, i) =>
          i === p.optionIndex ? { ...o, votes: [...o.votes, p.voterId!] } : o) };
      }));
    };
    socket.on('poll:new', onPollNew);
    socket.on('poll:vote', onPollVote);
    return () => {
      socket.off('poll:new', onPollNew);
      socket.off('poll:vote', onPollVote);
    };
  }, [socket]);

  // Typing indicators (Ably broadcast, throttled)
  useEffect(() => {
    if (!socket || !user) return;
    const onTyping = (payload: unknown) => {
      const p = payload as { roomId?: string; userId?: string; name?: string };
      if (!p?.roomId || !p.userId || p.userId === user.id) return;
      setTyping(prev => {
        const room = { ...(prev[p.roomId!] ?? {}) };
        room[p.userId!] = { name: p.name ?? '?', ts: Date.now() };
        return { ...prev, [p.roomId!]: room };
      });
    };
    socket.on('typing', onTyping);
    const iv = setInterval(() => {
      setTyping(prev => {
        const now = Date.now();
        let changed = false;
        const next: typeof prev = {};
        for (const [rid, users] of Object.entries(prev)) {
          const keep: Record<string, { name: string; ts: number }> = {};
          for (const [uidKey, info] of Object.entries(users)) {
            if (now - info.ts < 3500) keep[uidKey] = info; else changed = true;
          }
          if (Object.keys(keep).length > 0) next[rid] = keep; else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1200);
    return () => {
      socket.off('typing', onTyping);
      clearInterval(iv);
    };
  }, [socket, user]);

  // ===========================================================================
  // Auth
  // ===========================================================================

  const handleLogout = async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      if (supabase) await supabase.auth.signOut();
    } catch { /* ignore */ }
    setUser(null);
    setRooms([]);
    setPolls([]);
    setAnonQs([]);
    setPinned(null);
    setActive('');
    toast(t('auth.signedOut'));
  };

  // ===========================================================================
  // Actions
  // ===========================================================================

  const activeRoom = useMemo(() => rooms.find(r => r.id === active) ?? rooms[0], [rooms, active]);

  const pushPreview = (roomId: string, m: Message) => {
    if (!roomId) return;
    setPreviews(prev => ({
      ...prev,
      [roomId]: {
        roomId,
        authorName: m.authorName,
        text: m.text ?? '',
        mediaType: m.mediaType ?? null,
        isAnonymous: !!m.anon,
        ts: m.ts,
      },
    }));
  };

  const handleInputChange = (v: string) => {
    setInputValue(v);
    const now = Date.now();
    if (socket && activeRoom && v.trim() && now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now;
      socket.emit('typing', { roomId: activeRoom.id, userId: user?.id, name: user?.name });
    }
  };

  const onScrollMessages = () => {
    const el = scrollRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    fromBottomRef.current = fromBottom;
    setShowJump(fromBottom > 400);
    if (fromBottom < 140 && newBelow > 0) setNewBelow(0);
  };

  const jumpToBottom = () => {
    setNewBelow(0);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Vibe — живой индикатор настроения комнаты (уникальная фишка)
  const vibe = useMemo(() => {
    const msgs = activeRoom?.messages ?? [];
    const hourAgo = Date.now() - 3_600_000;
    const recent = msgs.filter(m => m.ts >= hourAgo).length;
    if (recent >= 12) return { Icon: Flame, key: 'vibe.fire', cls: 'text-orange-400 bg-orange-500/10 border-orange-500/25' } as const;
    if (recent >= 4) return { Icon: MessageSquare, key: 'vibe.active', cls: 'text-primary bg-primary/10 border-primary/25' } as const;
    return { Icon: CheckCircle2, key: 'vibe.quiet', cls: 'text-muted-foreground bg-muted/40 border-border' } as const;
  }, [activeRoom]);

  const typingForActive = useMemo(() => {
    if (!active) return null;
    const users = typing[active];
    if (!users) return null;
    const list = Object.values(users);
    if (list.length === 0) return null;
    return { first: list[0].name, count: list.length };
  }, [typing, active]);

  const dmOnline = !!activeRoom && activeRoom.roomType === 'dm'
    && onlineMembers.some(m => m.userId === activeRoom.dmOtherUserId);

  const sendMessage = async () => {
    if (!user || !activeRoom) return;
    const cleanText = sanitizeText(inputValue, MAX_MSG_LEN);
    if (!cleanText && !pendingImage) return;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMsg: Message = {
      id: tempId,
      authorId: user.id,
      authorName: user.name,
      role: user.role,
      text: cleanText,
      ts: Date.now(),
      anon,
      image: safeDataUrl(pendingImage),
      mediaType: pendingMediaType,
      replyTo: replyTo?.id,
      replySnippet: replyTo ? (replyTo.text || (replyTo.image ? '[attachment]' : '')).slice(0, 80) : undefined,
      forwardedFrom: forwardMsg?.authorName,
    };
    setRooms(prev => prev.map(r =>
      r.id === activeRoom.id ? { ...r, messages: [...r.messages, optimisticMsg] } : r,
    ));
    pushPreview(activeRoom.id, optimisticMsg);
    playSound('send');

    const inserted = await insertMessage({
      room_id: activeRoom.id,
      author_id: user.id,
      author_name: user.name,
      author_role: user.role,
      text: cleanText || null,
      image: safeDataUrl(pendingImage) ?? null,
      media_type: pendingImage ? pendingMediaType : null,
      reply_to: replyTo?.id ?? null,
      forwarded_from: forwardMsg?.authorName ?? null,
      forwarded_by: forwardMsg ? user.id : null,
      is_anonymous: anon,
    });

    if (inserted) {
      const realMsg = dbMsgToApp(inserted);
      if (realMsg.replyTo) {
        const orig = activeRoom.messages.find(m => m.id === realMsg.replyTo);
        if (orig) realMsg.replySnippet = (orig.text || (orig.image ? '[attachment]' : '')).slice(0, 80);
      }
      setRooms(prev => prev.map(r => {
        if (r.id !== activeRoom.id) return r;
        const msgs = [...r.messages];
        const idx = msgs.findIndex(m => m.id === tempId);
        if (idx >= 0) msgs[idx] = realMsg;
        else msgs.push(realMsg);
        return { ...r, messages: msgs };
      }));
    } else {
      toast.error('Failed to send message');
      setRooms(prev => prev.map(r =>
        r.id === activeRoom.id ? { ...r, messages: r.messages.filter(m => m.id !== tempId) } : r,
      ));
    }

    setInputValue('');
    setPendingImage(undefined);
    setPendingMediaType('image');
    setReplyTo(null);
    setForwardMsg(null);
    setAnon(false);
  };

  const toggleAnon = () => setAnon(prev => !prev);

  // ---- Channel comments ----
  const addComment = async (msgId: string, text: string) => {
    if (!user || !activeRoom) return;
    const clean = sanitizeText(text, MAX_MSG_LEN);
    if (!clean) return;
    const inserted = await insertChannelComment(msgId, activeRoom.id, user.id, user.name, clean);
    if (!inserted) {
      toast.error(t('cmt.failed'));
      return;
    }
    setChannelComments(prev => {
      const list = prev[msgId] ?? [];
      if (list.some(x => x.id === inserted.id)) return prev;
      return { ...prev, [msgId]: [...list, inserted] };
    });
  };

  const removeComment = async (comment: ChannelComment) => {
    const ok = await deleteChannelComment(comment.id);
    if (!ok) return;
    toast(t('cmt.deleted'));
    setChannelComments(prev => {
      const next: Record<string, ChannelComment[]> = {};
      for (const [mid, list] of Object.entries(prev)) next[mid] = list.filter(x => x.id !== comment.id);
      return next;
    });
  };

  const deleteRoom = async (id: string) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('rooms').delete().eq('id', id);
      setRooms(prev => prev.filter(r => r.id !== id));
      if (active === id) setActive('');
      toast(t('room.deleted'));
    } catch {
      toast.error('Failed to delete room');
    }
  };

  const createRoom = async (name: string, about: string, category: string, kind: RoomKind) => {
    if (!user) return;
    const cleanName = sanitizeText(name, 32);
    if (!cleanName) {
      toast.error(t('newRoom.enterName'));
      return;
    }
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase
        .from('rooms')
        .insert({
          name: cleanName,
          kind,
          room_type: 'channel',
          category,
          about: sanitizeText(about, MAX_ABOUT_LEN) || null,
          created_by: user.id,
        })
        .select()
        .single();
      if (error || !data) {
        toast.error('Failed to create room');
        return;
      }
      // Add the creator as a member so the channel shows up in their sidebar
      // (channels are opt-in now — membership drives visibility).
      await supabase.from('room_members').insert({
        room_id: data.id,
        user_id: user.id,
        role: 'admin',
      });
      const newRoom = dbRoomToApp(data as DbRoom, user.id, profiles);
      setRooms(prev => [...prev, newRoom]);
      setActive(data.id);
      toast.success(kind === 'channel' ? t('room.channelCreated') : t('room.chatCreated'));
    } catch {
      toast.error('Failed to create room');
    }
  };

  const startDm = async (otherUserId: string) => {
    if (!user) return;
    if (otherUserId === user.id) return;
    const roomId = await findOrCreateDm(user.id, otherUserId);
    if (!roomId) {
      toast.error('Failed to start DM');
      return;
    }
    const dbRoom = await loadRoom(roomId);
    if (!dbRoom) {
      toast.error('Failed to load DM room');
      return;
    }
    const appRoom = dbRoomToApp(dbRoom, user.id, profiles);
    setRooms(prev => prev.some(r => r.id === roomId) ? prev : [...prev, appRoom]);
    setActive(roomId);
    setSidebarOpen(false);
    toast.success(t('room.dmCreated'));
  };

  const openUserProfile = (userId: string) => {
    if (!profiles.some(p => p.id === userId)) return;
    setViewingProfileId(userId);
  };

  const createGroup = async (name: string, memberIds: string[]) => {
    if (!user) return;
    const cleanName = sanitizeText(name, 64);
    if (!cleanName) {
      toast.error(t('newRoom.enterName'));
      return;
    }
    if (memberIds.length === 0) {
      toast.error('Select at least one member');
      return;
    }
    const groupRoom = await apiCreateGroup(cleanName, memberIds, user.id);
    if (!groupRoom) {
      toast.error('Failed to create group');
      return;
    }
    const appRoom = dbRoomToApp(groupRoom, user.id, profiles);
    setRooms(prev => [...prev, appRoom]);
    setActive(groupRoom.id);
    setModalMode(null);
    toast.success(t('room.groupCreated'));
  };

  const forwardToRoom = async (roomId: string) => {
    if (!user || !forwardMsg) return;
    const inserted = await insertMessage({
      room_id: roomId,
      author_id: user.id,
      author_name: user.name,
      author_role: user.role,
      text: forwardMsg.text || null,
      image: forwardMsg.image ? safeDataUrl(forwardMsg.image) ?? null : null,
      media_type: forwardMsg.image ? (forwardMsg.mediaType ?? 'image') : null,
      forwarded_from: forwardMsg.authorName,
      forwarded_by: user.id,
      is_anonymous: false,
    });
    if (inserted) {
      toast.success(t('msg.forward'));
      if (roomId === activeRoom?.id) {
        const appMsg = dbMsgToApp(inserted);
        setRooms(prev => prev.map(r =>
          r.id === roomId ? { ...r, messages: [...r.messages, appMsg] } : r,
        ));
        pushPreview(roomId, appMsg);
      }
    } else {
      toast.error('Forward failed');
    }
    setForwardMsg(null);
    setModalMode(null);
  };

  const pinMessage = async (msg: Message) => {
    if (!activeRoom || !user) return;
    if (msg.id.startsWith('temp_')) {
      toast.error('Wait for the message to be sent first');
      return;
    }
    const pinText = msg.text || (msg.image ? (msg.mediaType === 'video' ? '[video]' : '[image]') : '');
    const ok = await pinMessageDb(activeRoom.id, msg.id, pinText, user.id);
    if (ok) {
      setPinned({ room: activeRoom.id, messageId: msg.id, text: pinText, ts: Date.now() });
      toast.success(t('room.pinCreated'));
    } else {
      toast.error('Failed to pin');
    }
  };

  const unpin = async () => {
    if (!activeRoom) return;
    const ok = await unpinDb(activeRoom.id);
    if (ok) {
      setPinned(null);
      toast(t('room.pinRemoved'));
    }
  };

  // ---- Room settings actions (working persistence) ----

  const handleUpdateRoom = async (patch: { name: string; about: string; category: string }) => {
    if (!activeRoom) return false;
    const cleanName = sanitizeText(patch.name, 64);
    if (!cleanName) { toast.error(t('newRoom.enterName')); return false; }
    const updated = await apiUpdateRoom(activeRoom.id, {
      name: cleanName,
      about: sanitizeText(patch.about, MAX_ABOUT_LEN) || null,
      category: patch.category || null,
    });
    if (!updated) { toast.error('Failed to save settings'); return false; }
    setRooms(prev => prev.map(r => r.id === activeRoom.id
      ? { ...r, name: updated.name, about: updated.about ?? undefined, category: updated.category ?? undefined }
      : r));
    toast.success(t('room.savedChanges'));
    return true;
  };

  const handleAddMembers = async (ids: string[]) => {
    if (!activeRoom || ids.length === 0) return false;
    const ok = await apiAddMembers(activeRoom.id, ids);
    if (ok) {
      toast.success(t('room.memberAdded'));
      refreshRooms();
    } else {
      toast.error('Failed to add members');
    }
    return ok;
  };

  const handleRemoveMember = async (userId: string) => {
    if (!activeRoom) return false;
    const ok = await apiRemoveMember(activeRoom.id, userId);
    if (ok) {
      toast.success(t('room.memberRemoved'));
      refreshRooms();
    } else {
      toast.error('Failed to remove member');
    }
    return ok;
  };

  const handleLeaveGroup = () => {
    if (!activeRoom || !user) return;
    if (!confirm(t('room.leaveGroupBody'))) return;
    apiRemoveMember(activeRoom.id, user.id).then(ok => {
      if (ok) {
        toast.success(t('room.memberLeft'));
        setRooms(prev => prev.filter(r => r.id !== activeRoom.id));
        setActive('');
        setModalMode(null);
      } else {
        toast.error('Failed to leave group');
      }
    });
  };

  const handleDeleteRoom = () => {
    if (!activeRoom) return;
    if (!confirm(`${t('room.deleteRoom')}? ${t('room.deleteRoomBody')}`)) return;
    const id = activeRoom.id;
    setModalMode(null);
    deleteRoom(id);
  };

  // ---- Polls & anonymous questions (local + Ably broadcast) ----

  const createPoll = (q: string, optionsArr: string[]) => {
    if (!activeRoom || !user) return;
    const cleanQ = sanitizeText(q, 200);
    const opts = optionsArr.map(s => sanitizeText(s, 100)).filter(Boolean).slice(0, 8);
    if (!cleanQ || opts.length < 2) {
      toast.error('Need a question and at least 2 options');
      return;
    }
    const poll: Poll = {
      id: uid('p'),
      room: activeRoom.id,
      q: cleanQ,
      options: opts.map(x => ({ t: x, votes: [] })),
      ts: Date.now(),
      authorId: user.id,
    };
    setPolls(prev => [...prev, poll]);
    socket?.emit('poll:new', { poll });
    toast.success(t('poll.published'));
  };

  const votePoll = (pollId: string, optIdx: number) => {
    if (!user) return;
    setPolls(prev => prev.map(p => {
      if (p.id !== pollId) return p;
      if (p.options.some(o => o.votes.includes(user.id))) return p;
      return { ...p, options: p.options.map((o, i) =>
        i === optIdx ? { ...o, votes: [...o.votes, user.id] } : o) };
    }));
    socket?.emit('poll:vote', { pollId, optionIndex: optIdx, voterId: user.id });
  };

  const askAnon = (q: string) => {
    if (!activeRoom || !user) return;
    const cleanQ = sanitizeText(q, 300);
    if (!cleanQ) { toast.error('Enter a question'); return; }
    const aq: AnonQuestion = {
      id: uid('a'),
      room: activeRoom.id,
      q: cleanQ,
      answers: [],
      answered: false,
      authorId: user.id,
    };
    setAnonQs(prev => [...prev, aq]);
    toast.success(t('anon.sent'));
  };

  const answerAnon = (aqId: string, text: string) => {
    if (!user) return;
    const clean = sanitizeText(text, 500);
    if (!clean) return;
    setAnonQs(prev => prev.map(q =>
      q.id === aqId
        ? { ...q, answers: [...q.answers, { text: clean, ts: Date.now() }], answered: true }
        : q,
    ));
    toast.success(t('anon.answerSent'));
  };

  const updateProfile = async (name: string, username: string, role: Role, avatar?: string, about?: string) => {
    if (!user) return false;
    const cleanName = sanitizeText(name, 32);
    if (!cleanName) { toast.error(t('profile.nameEmpty')); return false; }
    const cleanUsername = sanitizeText(username, 20).toLowerCase();
    const cleanAbout = about != null ? sanitizeText(about, 140) : undefined;
    const cleanAvatar = safeDataUrl(avatar, 100_000);
    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('profiles').update({
        name: cleanName,
        username: cleanUsername,
        role,
        avatar: cleanAvatar ?? null,
        ...(cleanAbout !== undefined ? { about: cleanAbout || null } : {}),
      }).eq('id', user.id);
    } catch (e) {
      console.warn('Profile update failed:', e);
    }
    setUser(prev => prev ? { ...prev, name: cleanName, username: cleanUsername, role, avatar: cleanAvatar, ...(cleanAbout !== undefined ? { about: cleanAbout || undefined } : {}) } : prev);
    setProfiles(prev => prev.map(p => p.id === user.id ? { ...p, name: cleanName, username: cleanUsername, role, avatar: cleanAvatar ?? null, ...(cleanAbout !== undefined ? { about: cleanAbout || null } : {}) } : p));
    return true;
  };

  const deleteMessage = async (msg: Message) => {
    setRooms(prev => prev.map(r =>
      r.id === (activeRoom?.id ?? '')
        ? { ...r, messages: r.messages.filter(m => m.id !== msg.id) }
        : r,
    ));
    if (msg.id.startsWith('temp_')) return;
    const ok = await apiDeleteMessage(msg.id);
    if (!ok) {
      toast.error('Failed to delete (only your own messages can be deleted)');
      if (activeRoom) {
        const dbMsgs = await loadMessages(activeRoom.id);
        setRooms(prev => prev.map(r => r.id === activeRoom.id ? { ...r, messages: dbMsgs.map(dbMsgToApp) } : r));
      }
    } else {
      toast(t('msg.deleted'));
    }
  };

  const startEdit = (msg: Message) => {
    if (msg.authorId !== user?.id) return;
    if (msg.id.startsWith('temp_')) return;
    setEditMsg(msg);
    setEditText(msg.text ?? '');
  };

  const cancelEdit = () => {
    setEditMsg(null);
    setEditText('');
  };

  const saveEdit = async () => {
    if (!editMsg || !user) return;
    const cleanText = sanitizeText(editText, MAX_MSG_LEN);
    if (!cleanText) {
      toast.error('Message text cannot be empty');
      return;
    }
    if (cleanText === editMsg.text) {
      cancelEdit();
      return;
    }
    const ok = await apiEditMessage(editMsg.id, cleanText);
    if (!ok) {
      toast.error('Failed to edit (only your own messages can be edited)');
      return;
    }
    setRooms(prev => prev.map(r =>
      r.id === (activeRoom?.id ?? '')
        ? {
            ...r,
            messages: r.messages.map(m =>
              m.id === editMsg.id ? { ...m, text: cleanText, editedAt: Date.now() } : m,
            ),
          }
        : r,
    ));
    toast.success(t('msg.edited'));
    cancelEdit();
  };

  // ===========================================================================
  // Voice messages (MediaRecorder → base64 data URL)
  // ===========================================================================

  const finishVoice = (send: boolean) => {
    if (!send) recCancelledRef.current = true;
    try { mediaRecRef.current?.stop(); } catch { /* already stopped */ }
  };

  const startVoice = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error(t('msg.micDenied'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mime = candidates.find(c => {
        try { return MediaRecorder.isTypeSupported(c); } catch { return false; }
      });
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunksRef.current = [];
      recCancelledRef.current = false;
      mr.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) recChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        try { stream.getTracks().forEach(tr => tr.stop()); } catch { /* ignore */ }
        if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
        setRec({ on: false, secs: 0 });
        if (recCancelledRef.current) return;
        const type = mr.mimeType || mime || 'audio/webm';
        const blob = new Blob(recChunksRef.current, { type });
        if (blob.size > 1_200_000) {
          toast.error(t('msg.voiceTooLarge'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          setPendingImage(reader.result as string);
          setPendingMediaType('audio');
          toast(t('msg.voice'));
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecRef.current = mr;
      setRec({ on: true, secs: 0 });
      recTimerRef.current = setInterval(() => {
        setRec(prev => {
          if (prev.secs + 1 >= 60) {
            finishVoice(true);
            return prev;
          }
          return { ...prev, secs: prev.secs + 1 };
        });
      }, 1000);
    } catch {
      toast.error(t('msg.micDenied'));
    }
  };

  const handleAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = /^video\/(mp4|webm|quicktime)$/.test(file.type);
    const isImage = /^image\/(jpeg|png|webp)$/.test(file.type);
    const maxBytes = isVideo ? 8 * 1024 * 1024 : AVATAR_MAX_BYTES;

    if (!isImage && !isVideo) {
      toast.error(t('msg.onlyFormats'));
      return;
    }
    if (file.size > maxBytes) {
      toast.error(isVideo ? 'Video must be under 8MB' : t('msg.fileTooLarge'));
      return;
    }
    const reader = new FileReader();

    if (isVideo) {
      reader.onload = () => {
        const dataUrl = reader.result as string;
        if (dataUrl.length > 1_500_000) {
          toast.error('Video file too large for inline storage. Try a shorter clip.');
          return;
        }
        setPendingImage(dataUrl);
        setPendingMediaType('video');
        toast(t('msg.videoAttached'));
      };
      reader.onerror = () => toast.error(t('msg.failedRead'));
      reader.readAsDataURL(file);
      e.target.value = '';
      return;
    }

    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        if (dataUrl.length > 200_000) {
          toast.error(t('msg.imageTooLarge'));
          return;
        }
        setPendingImage(dataUrl);
        toast(t('msg.imageAttached'));
      };
      img.onerror = () => toast.error(t('msg.failedRead'));
      img.src = reader.result as string;
    };
    reader.onerror = () => toast.error(t('msg.failedRead'));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ===========================================================================
  // Render
  // ===========================================================================

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="text-muted-foreground text-sm">{t('loading')}</div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onSuccess={() => {}} />;
  }

  const isDev = user.role === 'dev';
  const isAdmin = user.role === 'admin' || isDev;
  const activePinned = pinned && activeRoom && pinned.room === activeRoom.id ? pinned : null;
  const items = activeRoom?.messages ?? [];
  const roomPolls = polls.filter(p => activeRoom && p.room === activeRoom.id);
  const roomAnonQs = anonQs.filter(q => !q.answered && activeRoom && q.room === activeRoom.id);

  const myMembershipRole = activeRoom
    ? roomMemberships.find(m => m.room_id === activeRoom.id && m.user_id === user.id)?.role ?? null
    : null;

  // Who may post into a channel: owner, room admins, global admins and dev.
  // Regular members get a read-only composer lock (enforced again by RLS).
  const canPostToRoom = (r: Room | undefined): boolean => {
    if (!r) return false;
    if (r.kind !== 'channel') return true;
    if (isAdmin) return true;
    if (r.createdBy === user.id) return true;
    const m = roomMemberships.find(x => x.room_id === r.id && x.user_id === user.id);
    return m?.role === 'admin';
  };
  const canPostInActive = canPostToRoom(activeRoom);

  // Group messages by day
  const groupedItems: { date: string; items: Message[] }[] = [];
  let lastDate = '';
  for (const m of items) {
    const dl = formatDateLabel(m.ts, t, dateLocale);
    if (dl !== lastDate) {
      groupedItems.push({ date: dl, items: [m] });
      lastDate = dl;
    } else {
      groupedItems[groupedItems.length - 1].items.push(m);
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-[100dvh] flex overflow-hidden">
        <Sidebar
          rooms={rooms}
          active={active}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelect={(id) => {
            setActive(id);
            setSidebarOpen(false);
          }}
          onAddChannel={() => setModalMode('addChannel')}
          onAddGroup={() => setModalMode('createGroup')}
          onNewDm={() => setModalMode('newDm')}
          user={user}
          onLogout={handleLogout}
          onSettings={() => setModalMode('settings')}
          onlineMembers={onlineMembers}
          isConnected={isConnected}
          onMemberClick={openUserProfile}
          profiles={profiles}
          previews={previews}
          seen={prefs.seen ?? {}}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main
          className="flex-1 flex flex-col min-w-0 relative chat-wallpaper"
          style={settings.wallpaper !== 'none' ? ({ '--chat-wallpaper': WALLPAPER_PRESETS[settings.wallpaper].css } as React.CSSProperties) : undefined}
        >
          {/* Top bar */}
          <header className="glass border-b border-border flex items-center gap-2.5 px-3 sm:px-5 h-16 shrink-0">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Menu">
              <MenuIcon className="size-5" />
            </Button>
            {activeRoom && (
              <>
                <div className="room-avatar size-9 sm:size-10" style={{ background: roomColor(activeRoom) }}>
                  {activeRoom.roomType === 'dm' ? (
                    <Avatar
                      user={{
                        id: activeRoom.dmOtherUserId ?? activeRoom.id,
                        name: activeRoom.name,
                        avatar: profiles.find(p => p.id === activeRoom.dmOtherUserId)?.avatar ?? undefined,
                      }}
                      size={34}
                    />
                  ) : activeRoom.roomType === 'group' ? (
                    <Users className="size-4" />
                  ) : activeRoom.kind === 'channel' ? (
                    <Megaphone className="size-4" />
                  ) : (
                    <MessageSquare className="size-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold truncate">{activeRoom.name}</span>
                    {activeRoom.roomType !== 'dm' && (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide hidden sm:inline-flex shrink-0">
                        {activeRoom.kind === 'channel' ? t('room.channel') : t('room.chat')}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground h-4 flex items-center gap-1.5 min-w-0">
                    {typingForActive ? (
                      <span className="text-primary font-medium inline-flex items-center gap-1.5 truncate">
                        <span className="truncate">
                          {typingForActive.count === 1
                            ? `${typingForActive.first} ${t('msg.typing')}`
                            : t('msg.typingSeveral')}
                        </span>
                        <span className="inline-flex items-end gap-[2px]" aria-hidden>
                          <span className="typing-dot size-1 rounded-full bg-current inline-block" />
                          <span className="typing-dot size-1 rounded-full bg-current inline-block" />
                          <span className="typing-dot size-1 rounded-full bg-current inline-block" />
                        </span>
                      </span>
                    ) : activeRoom.roomType === 'dm' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`size-1.5 rounded-full ${dmOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                        {dmOnline ? t('nav.online') : t('nav.offline')}
                      </span>
                    ) : (
                      <span className="truncate word-safe">{activeRoom.about || ''}</span>
                    )}
                  </div>
                </div>
                {/* Vibe — живой индикатор настроения комнаты */}
                <div className={`hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs font-medium shrink-0 ${vibe.cls}`}>
                  <vibe.Icon className="size-3.5" />
                  {t(vibe.key)}
                </div>
                {/* Room settings — working settings for channel/chat/group/DM */}
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setModalMode('roomSettings')} aria-label={t('room.settings')}>
                  <SettingsIcon className="size-4" />
                </Button>
              </>
            )}
          </header>

          {/* Pinned banner */}
          {activePinned && (
            <div className="glass border-b border-border px-3 sm:px-5 py-2 flex items-center gap-2.5 text-sm slide-down">
              <span className="brand-mark size-7 rounded-lg flex items-center justify-center shrink-0">
                <Pin className="size-3.5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('room.pinned')}</div>
                <div className="truncate word-safe">{activePinned.text}</div>
              </div>
              <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={unpin} aria-label={t('room.unpin')}>
                <X className="size-3.5" />
              </Button>
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} onScroll={onScrollMessages} className="flex-1 overflow-y-auto scroll-thin px-3 sm:px-4 py-4">
            <div key={active} className="max-w-3xl mx-auto flex flex-col gap-2.5 room-switch">
              {loadingRooms && (
                <div className="flex flex-col gap-3 pt-2 fade-in">
                  {[46, 68, 40, 60, 34].map((w, i) => (
                    <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
                      <div className="skeleton h-10" style={{ width: `${w * 6}px` }} />
                    </div>
                  ))}
                </div>
              )}
              {!loadingRooms && groupedItems.length === 0 && roomPolls.length === 0 && roomAnonQs.length === 0 && (
                <div className="text-center py-16 fade-in">
                  <div className="relative size-24 mx-auto mb-4">
                    <div className="aurora-blob absolute inset-2 rounded-full blur-2xl opacity-70" style={{ background: 'var(--grad-brand)' }} />
                    <div className="relative size-24 rounded-full glass border border-border flex items-center justify-center">
                      <MessageSquare className="size-9 text-primary" />
                    </div>
                  </div>
                  {activeRoom ? (
                    <>
                      <p className="text-base font-semibold">{t('room.empty')}</p>
                      <p className="text-sm text-muted-foreground mt-1">{t('room.emptyHint')}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-semibold">{t('room.nothingSelected')}</p>
                      <p className="text-sm text-muted-foreground mt-1">{t('room.selectHint')}</p>
                    </>
                  )}
                </div>
              )}

              {groupedItems.map((group, gi) => (
                <div key={gi} className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-3 my-2.5 fade-in">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider px-3 py-1 rounded-full bg-muted/50 border border-border/60">{group.date}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  {group.items.map((it, i) => {
                    const prev = group.items[i - 1];
                    const showHeader = !prev || prev.authorId !== it.authorId || prev.anon !== it.anon || (it.ts - prev.ts) > 5 * 60 * 1000;
                    return (
                      <MessageItem
                        key={it.id}
                        msg={it}
                        currentUserId={user.id}
                        showHeader={showHeader}
                        isPinned={activePinned?.messageId === it.id}
                        isEditing={editMsg?.id === it.id}
                        editText={editMsg?.id === it.id ? editText : (it.text ?? '')}
                        onEditChange={setEditText}
                        onEditSave={saveEdit}
                        onEditCancel={cancelEdit}
                        onReply={(m) => setReplyTo(m)}
                        onForward={(m) => { setForwardMsg(m); setModalMode('forward'); }}
                        onPin={(m) => pinMessage(m)}
                        onUnpin={activePinned ? unpin : undefined}
                        onDelete={(m) => deleteMessage(m)}
                        onEdit={(m) => startEdit(m)}
                        canModerate={isDev}
                        channelMode={activeRoom?.kind === 'channel'}
                        comments={activeRoom?.kind === 'channel' ? (channelComments[it.id] ?? []) : undefined}
                        commentsAllowed={activeRoom?.kind === 'channel'
                          ? (activeRoom.commentsEnabled !== false || canPostInActive)
                          : false}
                        canModerateComments={canPostInActive}
                        onAddComment={activeRoom?.kind === 'channel' ? addComment : undefined}
                        onDeleteComment={removeComment}
                        onCopy={(text) => {
                          navigator.clipboard?.writeText(text);
                          toast(t('msg.copied'));
                        }}
                        onAuthorClick={(uid) => openUserProfile(uid)}
                        t={t}
                      />
                    );
                  })}
                </div>
              ))}

              {activeRoom?.kind === 'chat' && roomPolls.map(p => (
                <PollCard key={p.id} poll={p} currentUserId={user.id} onVote={votePoll} t={t} />
              ))}

              {activeRoom?.kind === 'chat' && roomAnonQs.map(q => (
                <AnonCard key={q.id} q={q} onAnswer={answerAnon} t={t} />
              ))}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Jump to latest */}
          {showJump && (
            <button
              type="button"
              onClick={jumpToBottom}
              aria-label={t('scroll.bottom')}
              className="absolute bottom-32 right-4 sm:right-6 z-10 size-10 rounded-full glass border border-border shadow-lg flex items-center justify-center text-primary hover:scale-105 transition-transform"
            >
              <ArrowDown className="size-4" />
              {newBelow > 0 && (
                <span className="brand-mark absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {newBelow > 9 ? '9+' : newBelow}
                </span>
              )}
            </button>
          )}

          {/* Composer — hidden when no room is selected */}
          {activeRoom && (
          <div className="glass border-t border-border px-3 sm:px-4 pt-2.5" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
            <div className="max-w-3xl mx-auto flex flex-col gap-2">
              {/* Anonymous mode chip */}
              {anon && (
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/25 text-xs fade-in">
                  <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                    <EyeOff className="size-3.5" /> {t('msg.anonModeOn')}
                  </span>
                  <button type="button" className="text-primary/70 hover:text-primary" onClick={toggleAnon} aria-label={t('msg.anonymous')}>
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
              {/* Reply preview */}
              {replyTo && (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/40 border border-border text-xs">
                  <Send className="size-3.5 text-primary shrink-0 -rotate-45" />
                  <div className="flex-1 min-w-0">
                    <span className="text-muted-foreground">{t('msg.repliedTo')} </span>
                    <span className="font-medium">{replyTo.authorName}: </span>
                    <span className="text-muted-foreground truncate">{replyTo.text?.slice(0, 60) || '...'}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="size-5 shrink-0" onClick={() => setReplyTo(null)}>
                    <X className="size-3" />
                  </Button>
                </div>
              )}
              {/* Forward preview */}
              {forwardMsg && (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/40 border border-border text-xs">
                  <ArrowDown className="size-3.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-muted-foreground">{t('msg.forwardedFrom')} </span>
                    <span className="font-medium">{forwardMsg.authorName}: </span>
                    <span className="text-muted-foreground truncate">{forwardMsg.text?.slice(0, 60) || '...'}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="size-5 shrink-0" onClick={() => setForwardMsg(null)}>
                    <X className="size-3" />
                  </Button>
                </div>
              )}
              {/* Attachment preview */}
              {pendingImage && (
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted/40 border border-border">
                  {pendingMediaType === 'audio' ? (
                    <audio src={pendingImage} controls className="h-9 w-64 max-w-full" />
                  ) : pendingMediaType === 'video' ? (
                    <video src={pendingImage} className="max-h-28 rounded-lg border border-border" controls preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pendingImage} alt="attachment" className="max-h-28 rounded-lg border border-border" />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 ml-auto"
                    onClick={() => { setPendingImage(undefined); setPendingMediaType('image'); }}
                    aria-label="Remove attachment"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              )}
              {activeRoom?.kind === 'channel' && !canPostInActive ? (
                /* Channel read-only: only owner/admins can post */
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-muted/40 border border-border text-sm">
                  <Lock className="size-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t('channel.postLocked')}</div>
                    <div className="text-xs text-muted-foreground truncate">{t('channel.postLockedHint')}</div>
                  </div>
                </div>
              ) : rec.on ? (
                /* Voice recording bar */
                <div className="flex items-center gap-3 h-[46px] px-4 rounded-2xl bg-destructive/10 border border-destructive/30">
                  <span className="rec-dot size-3 rounded-full bg-destructive shrink-0" />
                  <span className="text-sm font-semibold tabular-nums">
                    {String(Math.floor(rec.secs / 60)).padStart(2, '0')}:{String(rec.secs % 60).padStart(2, '0')}
                  </span>
                  <span className="flex-1 flex items-end justify-center gap-[3px] h-5" aria-hidden>
                    {[8, 14, 10, 18, 12, 16, 9, 15, 11, 17, 8, 13].map((h, i) => (
                      <span
                        key={i}
                        className="typing-dot w-[3px] rounded-full bg-destructive/60"
                        style={{ height: `${h}px`, animationDelay: `${i * 0.09}s` }}
                      />
                    ))}
                  </span>
                  <Button variant="ghost" size="icon" className="size-9 shrink-0 text-destructive" onClick={() => finishVoice(false)} aria-label={t('msg.voiceCancel')}>
                    <Trash2 className="size-4" />
                  </Button>
                  <Button size="icon" className="size-9 rounded-full shrink-0" onClick={() => finishVoice(true)} aria-label={t('msg.voiceStop')}>
                    <Send className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-end gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                    onChange={handleAttach}
                    className="hidden"
                  />
                  {/* Room actions ⋮ — polls, anonymous questions (next to the input, per request) */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0 rounded-xl" aria-label={t('msg.moreActions')}>
                        <MoreVertical className="size-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 dropdown-in">
                      {activePinned && (
                        <DropdownMenuItem onClick={unpin}>
                          <X className="size-4 mr-2" /> {t('room.unpin')}
                        </DropdownMenuItem>
                      )}
                      {activeRoom?.kind !== 'channel' && (
                        <DropdownMenuItem onClick={() => setModalMode('poll')}>
                          <BarChart3 className="size-4 mr-2" /> {t('poll.new')}
                        </DropdownMenuItem>
                      )}
                      {activeRoom?.kind !== 'channel' && (
                        <DropdownMenuItem onClick={() => setModalMode('anon')}>
                          <EyeOff className="size-4 mr-2" /> {t('anon.new')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={toggleAnon} className={anon ? 'text-primary' : ''}>
                        <EyeOff className="size-4 mr-2" /> {t('msg.anonymous')}
                        {anon && <CheckCircle2 className="size-3.5 ml-auto" />}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {/* Attach photo / video */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0 rounded-xl" onClick={() => fileInputRef.current?.click()} aria-label={t('msg.attach')}>
                        <ImagePlus className="size-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('msg.attach')}</TooltipContent>
                  </Tooltip>
                  {/* Placeholder overlay: a native textarea placeholder soft-wraps and
                      gets clipped mid-line on narrow screens / long locales (ru/es/de).
                      The overlay keeps it to one line with an ellipsis at any width or
                      font scale. */}
                  <div className="relative min-w-0 flex-1">
                    <Textarea
                      value={inputValue}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        // sendOnEnter=true (default): Enter sends, Shift+Enter newline.
                        // sendOnEnter=false: Ctrl/Cmd+Enter sends, Enter = newline.
                        const wantSend = settings.sendOnEnter
                          ? (e.key === 'Enter' && !e.shiftKey)
                          : (e.key === 'Enter' && (e.ctrlKey || e.metaKey));
                        if (wantSend) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      aria-label={t('msg.typePlaceholder')}
                      rows={1}
                      className="resize-none min-h-[42px] max-h-32 rounded-2xl bg-muted/40 border-border/60"
                      maxLength={MAX_MSG_LEN}
                    />
                    {inputValue === '' && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 right-3 top-2 truncate text-base md:text-sm text-muted-foreground"
                      >
                        {t('msg.typePlaceholder')}
                      </div>
                    )}
                  </div>
                  {/* Voice recorder */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0 rounded-xl" onClick={startVoice} aria-label={t('msg.voiceRecord')}>
                        <Mic className="size-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('msg.voiceRecord')}</TooltipContent>
                  </Tooltip>
                  <Button
                    size="icon"
                    className="shrink-0 rounded-xl"
                    onClick={sendMessage}
                    disabled={!inputValue.trim() && !pendingImage}
                    aria-label={t('msg.send')}
                  >
                    <Send className="size-5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          )}
        </main>
      </div>

      {/* ------------------- Modals ------------------- */}
      {modalMode === 'addChannel' && (
        <AddRoomModal onClose={() => setModalMode(null)} onCreate={createRoom} t={t} />
      )}
      {modalMode === 'createGroup' && (
        <CreateGroupModal
          onClose={() => setModalMode(null)}
          onCreate={createGroup}
          profiles={profiles}
          currentUserId={user.id}
          t={t}
        />
      )}
      {modalMode === 'newDm' && (
        <NewDmModal
          onClose={() => setModalMode(null)}
          onStart={startDm}
          profiles={profiles}
          currentUserId={user.id}
          t={t}
        />
      )}
      {modalMode === 'forward' && forwardMsg && (
        <ForwardModal
          onClose={() => { setModalMode(null); setForwardMsg(null); }}
          onForward={forwardToRoom}
          rooms={rooms.filter(canPostToRoom)}
          currentRoomId={activeRoom?.id}
          t={t}
        />
      )}
      {modalMode === 'poll' && (
        <PollModal onClose={() => setModalMode(null)} onCreate={createPoll} t={t} />
      )}
      {modalMode === 'anon' && (
        <AnonModal onClose={() => setModalMode(null)} onAsk={askAnon} t={t} />
      )}
      {modalMode === 'settings' && (
        <SettingsModal
          onClose={() => setModalMode(null)}
          user={user}
          memberSince={profiles.find(p => p.id === user.id)?.created_at}
          onUpdateProfile={(name, username, avatar, about) => updateProfile(name, username, user.role, avatar, about)}
          onLogout={handleLogout}
          devInfo={{
            userId: user.id,
            email: user.email ?? '',
            role: user.role,
            socketConnected: isConnected,
            onlineCount: onlineMembers.length,
            roomsCount: rooms.length,
            profilesCount: profiles.length,
            activeRoomId: activeRoom?.id ?? '',
            activeRoomKind: activeRoom ? `${activeRoom.kind}/${activeRoom.roomType}` : '',
            messagesCount: rooms.reduce((s, r) => s + r.messages.length, 0),
            onRefreshRooms: () => { refreshRooms(); toast(t('dev.roomsRefreshed')); },
            onClearCaches: () => {
              try {
                localStorage.removeItem('holler_v1');
                localStorage.removeItem('holler_local_settings_v1');
                localStorage.removeItem('holler_room_prefs_v1');
              } catch { /* ignore */ }
              toast(t('dev.cachesCleared'));
              setTimeout(() => window.location.reload(), 600);
            },
            getSnapshot: () => JSON.stringify({
              user: { id: user.id, name: user.name, role: user.role, email: user.email, username: user.username, about: user.about },
              connection: { socket: isConnected, online: onlineMembers.length },
              rooms: rooms.map(r => ({
                id: r.id, name: r.name, kind: r.kind, roomType: r.roomType,
                commentsEnabled: r.commentsEnabled, createdBy: r.createdBy,
                messages: r.messages.length,
              })),
              profiles: profiles.length,
              commentCounts: Object.fromEntries(Object.entries(channelComments).map(([k, v]) => [k, v.length])),
              previews,
            }, null, 2),
          }}
        />
      )}
      {modalMode === 'roomSettings' && activeRoom && (
        <RoomSettingsModal
          onClose={() => setModalMode(null)}
          room={activeRoom}
          profiles={profiles}
          currentUserId={user.id}
          globalAdmin={isAdmin}
          myMembershipRole={myMembershipRole}
          onUpdateRoom={handleUpdateRoom}
          onDeleteRoom={handleDeleteRoom}
          onLeaveGroup={handleLeaveGroup}
          onAddMembers={handleAddMembers}
          onRemoveMember={handleRemoveMember}
          onToggleComments={async (v) => {
            if (!activeRoom) return false;
            const upd = await apiUpdateRoom(activeRoom.id, { comments_enabled: v });
            if (!upd) return false;
            setRooms(prev => prev.map(r => r.id === activeRoom.id ? { ...r, commentsEnabled: v } : r));
            return true;
          }}
          t={t}
          dateLocale={dateLocale}
        />
      )}
      {viewingProfileId && user && (() => {
        const p = profiles.find(pr => pr.id === viewingProfileId);
        if (!p) return null;
        const isOwn = p.id === user.id;
        return (
          <UserProfileModal
            profile={p}
            isOwn={isOwn}
            dateLocale={dateLocale}
            onClose={() => setViewingProfileId(null)}
            onStartDm={isOwn ? undefined : (uid) => { setViewingProfileId(null); startDm(uid); }}
            onEditProfile={isOwn ? () => setModalMode('settings') : undefined}
            t={t}
          />
        );
      })()}
    </TooltipProvider>
  );
}
