'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useSocket, type OnlineMember } from '@/hooks/use-socket';
import { useAuth } from '@/hooks/use-auth';
import { AuthScreen } from '@/components/auth-screen';
import { MessageContextMenu } from '@/components/message-context-menu';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useI18n } from '@/lib/i18n';
import {
  type DbRoom, type DbMessage, type DbProfile, type DbRoomMember,
  loadRooms, loadMessages, loadProfiles, loadRoom,
  insertMessage, softDeleteMessage as apiDeleteMessage, editMessage as apiEditMessage,
  findOrCreateDm, createGroup as apiCreateGroup,
  pinMessageDb, loadPin, unpinDb,
  subscribeToRoomMessages, subscribeToRooms, subscribeToPin,
} from '@/lib/api';
import {
  Send, Plus, Pin, BarChart3, EyeOff, Trash2, Info, User as UserIcon,
  Menu as MenuIcon, LogOut, ImagePlus, Hash, MessageSquare, MoreVertical,
  Search, ChevronRight, Settings, Megaphone, BookOpen, ShoppingBag, Sparkles,
  CheckCircle2, Circle, X, Users, AlertCircle, Sun, Moon, Wifi, WifiOff,
  Reply, Forward, Copy, Video, Smile, Paperclip, UserPlus,
} from 'lucide-react';

// ============================================================================
// Typeы
// ============================================================================

type Role = 'member' | 'admin';
type RoomKind = 'channel' | 'chat';
type RoomCategory = string; // 'announcements' | 'study' | 'dm' | 'group' | 'general' | ...
type ModalMode = 'addChannel' | 'pin' | 'poll' | 'anon' | 'profile' | 'info' | 'createGroup' | 'forward' | 'newDm' | null;

interface User {
  id: string;
  name: string;
  role: Role;
  avatar?: string;
  email?: string;
}

interface Message {
  id: string;
  authorId: string;
  authorName: string;
  role?: Role;
  text: string;
  ts: number;
  anon?: boolean;
  image?: string;
  mediaType?: 'image' | 'video';
  replyTo?: string;        // reply_to message id (schema v2 column)
  replySnippet?: string;   // resolved snippet for display
  forwardedFrom?: string;  // original author name
  forwardedBy?: string;    // who forwarded
  deletedAt?: number;
  editedAt?: number;
}

interface Room {
  id: string;
  name: string;
  kind: RoomKind;
  roomType: 'channel' | 'dm' | 'group'; // schema v2 room_type column
  category?: RoomCategory;
  about?: string;
  messages: Message[];
  dmOtherUserId?: string;
  dmOtherName?: string;
  groupMembers?: string[];
  createdBy?: string;
  createdAt?: number;
}

interface PollOption { t: string; votes: string[]; }
interface Poll {
  id: string;
  room: string;
  q: string;
  options: PollOption[];
  ts: number;
  authorId: string;
}

interface AnonQuestion {
  id: string;
  room: string;
  q: string;
  answers: { text: string; ts: number }[];
  answered: boolean;
  authorId: string;
}

interface Pinned { room: string; text: string; ts: number; }

interface AppState {
  user: User | null;
  rooms: Room[];
  active: string;
  anon: boolean;
  pinned: Pinned | null;
  polls: Poll[];
  anonQs: AnonQuestion[];
}

// ============================================================================
// Константы
// ============================================================================

const STORAGE_KEY = 'holler_v1';
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_DIM = 160;
const MAX_MSG_LEN = 2000;
const MAX_NAME_LEN = 32;
const MAX_ABOUT_LEN = 120;

// Textовые категории вместо эмодзи
const CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'study', label: 'Study' },
  { id: 'life', label: 'Class Life' },
  { id: 'shop', label: 'Marketplace' },
  { id: 'sport', label: 'Sport' },
  { id: 'creative', label: 'Creative' },
  { id: 'other', label: 'Other' },
] as const;

const DEFAULT_ROOMS: Room[] = [
  { id: 'c_ann', name: 'Announcements', kind: 'channel', roomType: 'channel', category: 'announcements', about: 'Schedule changes, deadlines, important stuff', messages: [] },
  { id: 'c_life', name: 'Class Life', kind: 'channel', roomType: 'channel', category: 'life', about: 'Photos, stories, memes', messages: [] },
  { id: 'c_study', name: 'Study', kind: 'channel', roomType: 'channel', category: 'study', about: 'Homework, notes, cheat sheets', messages: [] },
  { id: 'c_shop', name: 'Marketplace', kind: 'channel', roomType: 'channel', category: 'shop', about: 'Sell, buy, give away', messages: [] },
  { id: 'g_main', name: 'General Chat', kind: 'chat', roomType: 'channel', category: 'general', about: 'Class communication', messages: [] },
];

const AVATAR_COLORS = ['#f5a623', '#e94e6a', '#3fb950', '#9d7bd8', '#39c5cf', '#d29922', '#db61a2', '#7ee787'];

// ============================================================================
// Утилиты
// ============================================================================

function avColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase() || '?';
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function uid(prefix = 'm'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function categoryLabel(id?: string): string {
  return CATEGORIES.find(c => c.id === id)?.label || 'Other';
}

function safeDataUrl(url: string | undefined, maxLen = 200_000): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  if (!url.startsWith('data:image/')) return undefined;
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(url)) return undefined;
  if (url.length > maxLen) return undefined;
  return url;
}

function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, maxLen)
    .trim();
}

// ============================================================================
// Загрузка/сохранение — только UI prefs (active room, anon, polls cache)
// Rooms и messages теперь хранятся в Supabase, не в localStorage.
// ============================================================================

interface Prefs {
  active: string;
  anon: boolean;
  theme?: 'light' | 'dark';
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
      theme: p.theme,
    };
  } catch { return base; }
}

function savePrefs(p: Prefs): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

// ============================================================================
// Converters: DB rows → app types
// ============================================================================

/** Convert a DB message row to app Message (schema v2: real columns for media/reply/forward). */
function dbMsgToApp(m: DbMessage): Message {
  return {
    id: m.id,
    authorId: m.author_id ?? 'unknown',
    authorName: m.author_name,
    role: m.author_role === 'admin' ? 'admin' : 'member',
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

/** Convert a DB room row to app Room using real room_type/dm_user1/2 columns. */
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
  return room;
}

// ============================================================================
// Главный компонент
// ============================================================================

export default function ClientApp() {
  // prefs only — rooms/messages are loaded from Supabase
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
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

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [pendingImage, setPendingImage] = useState<string | undefined>();
  const [pendingMediaType, setPendingMediaType] = useState<'image' | 'video'>('image');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'rooms' | 'members'>('rooms');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [editMsg, setEditMsg] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // i18n
  const { t } = useI18n();

  // Auth via Supabase
  const { user: authUser, loading: authLoading } = useAuth();

  // Sync auth user with our `user` state
  useEffect(() => {
    if (authUser) {
      setUser(prev => {
        if (prev && prev.id === authUser.id && prev.name === authUser.name) return prev;
        return {
          id: authUser.id,
          name: authUser.name,
          role: authUser.role,
          avatar: authUser.avatar,
          email: authUser.email,
        };
      });
    } else if (!authLoading) {
      setUser(null);
    }
  }, [authUser, authLoading]);

  // WebSocket-хук для реального времени (presence, optional broadcast)
  const { socket, isConnected, onlineMembers } = useSocket({ user });

  // Persist UI prefs only
  useEffect(() => {
    savePrefs({ active, anon });
  }, [active, anon]);

  // Auto-scroll to bottom on new messages / room switch
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rooms, active]);

  // ===========================================================================
  // Load rooms + profiles from Supabase once user is logged in
  // ===========================================================================
  const refreshRooms = useCallback(async () => {
    if (!user) return;
    try {
      const [{ rooms: dbRooms, memberships }, dbProfiles] = await Promise.all([
        loadRooms(user.id),
        loadProfiles(),
      ]);
      setProfiles(dbProfiles);
      const appRooms = dbRooms.map(r => dbRoomToApp(r, user.id, dbProfiles));
      setRoomMemberships(memberships);
      setRooms(appRooms);
      // If no active room yet, pick the first channel
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

  // Subscribe to room list changes (new rooms, deleted rooms)
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToRooms(() => { refreshRooms(); });
    return unsub;
  }, [user, refreshRooms]);

  // ===========================================================================
  // Load messages for the active room + subscribe to realtime inserts
  // ===========================================================================
  useEffect(() => {
    if (!active || !user) return;
    let cancelled = false;
    (async () => {
      const dbMsgs = await loadMessages(active);
      if (cancelled) return;
      const appMsgs = dbMsgs.map(dbMsgToApp);
      setRooms(prev => prev.map(r => r.id === active ? { ...r, messages: appMsgs } : r));
      // Load pin for this room
      const pin = await loadPin(active);
      if (cancelled) return;
      setPinned(pin ? { room: active, text: pin.text, ts: pin.ts } : null);
    })();
    const unsub = subscribeToRoomMessages(
      active,
      (dbMsg) => {
        const appMsg = dbMsgToApp(dbMsg);
        // Own messages were already added optimistically in sendMessage
        if (appMsg.authorId === user.id) return;
        setRooms(prev => prev.map(r =>
          r.id === active ? { ...r, messages: [...r.messages, appMsg] } : r,
        ));
      },
      (dbMsg) => {
        // UPDATE event: soft-deleted messages disappear, edits refresh
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
    // Also subscribe to pin changes
    const unsubPin = subscribeToPin(active, async () => {
      const pin = await loadPin(active);
      setPinned(pin ? { room: active, text: pin.text, ts: pin.ts } : null);
    });
    return () => { cancelled = true; unsub(); unsubPin(); };
  }, [active, user]);

  // ===========================================================================
  // Ably broadcast handlers (kept for online members; messages now via Supabase realtime)
  // ===========================================================================
  const processedMsgIds = useRef<Set<string>>(new Set());

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

  // ===========================================================================
  // Auth
  // ===========================================================================

  const handleLogout = async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      if (supabase) await supabase.auth.signOut();
    } catch {}
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

  const sendMessage = async () => {
    if (!user || !activeRoom) return;
    const cleanText = sanitizeText(inputValue, MAX_MSG_LEN);
    if (!cleanText && !pendingImage) return;

    // Optimistic local insert with a temp id
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

    // Insert into Supabase (schema v2: real columns)
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
      // Resolve reply snippet from current room messages
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

  const deleteRoom = async (id: string) => {
    // For DM/group rooms, only the creator can delete via API; for channels, only admin
    // We attempt deletion; RLS allows authenticated to delete any room (v1 schema is permissive)
    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('rooms').delete().eq('id', id);
      setRooms(prev => prev.filter(r => r.id !== id));
      if (active === id) setActive(rooms[0]?.id ?? '');
      toast(t('room.deleted'));
    } catch (e) {
      toast.error('Failed to delete room');
    }
  };

  const createRoom = async (name: string, about: string, category: string, kind: RoomKind) => {
    if (!user) return;
    const cleanName = sanitizeText(name, 32);
    if (!cleanName) {
      toast.error(t('room.enterName'));
      return;
    }
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase
        .from('rooms')
        .insert({
          name: cleanName,
          kind,
          room_type: 'channel', // plain chat vs channel is distinguished by kind
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
      // Realtime subscription will refresh the room list, but we also add manually for snappiness
      const newRoom = dbRoomToApp(data as DbRoom, user.id, profiles);
      setRooms(prev => [...prev, newRoom]);
      setActive(data.id);
      toast.success(kind === 'channel' ? t('room.channelCreated') : t('room.chatCreated'));
    } catch {
      toast.error('Failed to create room');
    }
  };

  /** Start a DM with another user via get_or_create_dm RPC. */
  const startDm = async (otherUserId: string) => {
    if (!user) return;
    if (otherUserId === user.id) {
      toast.error("Can't DM yourself");
      return;
    }
    const roomId = await findOrCreateDm(user.id, otherUserId);
    if (!roomId) {
      toast.error('Failed to start DM');
      return;
    }
    // Reload rooms (membership changed); realtime may also fire
    const dbRoom = await loadRoom(roomId);
    if (!dbRoom) {
      toast.error('Failed to load DM room');
      return;
    }
    const appRoom = dbRoomToApp(dbRoom, user.id, profiles);
    setRooms(prev => prev.some(r => r.id === roomId) ? prev : [...prev, appRoom]);
    setActive(roomId);
    setSidebarOpen(false);
    setSidebarTab('rooms');
    toast.success(t('room.dmCreated'));
  };

  /** Create a group chat with the given name and member IDs. */
  const createGroup = async (name: string, memberIds: string[]) => {
    if (!user) return;
    const cleanName = sanitizeText(name, 64);
    if (!cleanName) {
      toast.error(t('room.enterName'));
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

  /** Forward the current `forwardMsg` to the given room (schema v2 forwarded_from). */
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
      toast.success(t('msg.forwarded'));
      // If forwarding to the active room, add locally (realtime skips own inserts handled elsewhere)
      if (roomId === activeRoom?.id) {
        const appMsg = dbMsgToApp(inserted);
        setRooms(prev => prev.map(r =>
          r.id === roomId ? { ...r, messages: [...r.messages, appMsg] } : r,
        ));
      }
    } else {
      toast.error('Forward failed');
    }
    setForwardMsg(null);
    setModalMode(null);
  };

  const pinMessage = async (text: string) => {
    if (!activeRoom || !user) return;
    const clean = sanitizeText(text, 500);
    if (!clean) {
      toast.error('Enter text');
      return;
    }
    const ok = await pinMessageDb(activeRoom.id, clean, user.id);
    if (ok) {
      setPinned({ room: activeRoom.id, text: clean, ts: Date.now() });
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
      options: opts.map(t => ({ t, votes: [] })),
      ts: Date.now(),
      authorId: user.id,
    };
    setPolls(prev => [...prev, poll]);
    socket?.emit('poll:new', { poll });
    toast.success('Poll published');
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
    toast.success('Anonymous question sent');
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
    toast.success('Answer sent anonymously');
  };

  const updateProfile = async (name: string, role: Role, avatar?: string) => {
    if (!user) return;
    const cleanName = sanitizeText(name, MAX_NAME_LEN);
    if (!cleanName) { toast.error('Name cannot be empty'); return; }
    const cleanAvatar = safeDataUrl(avatar, 100_000);
    // Update Supabase profile
    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('profiles').update({
        name: cleanName,
        role,
        avatar: cleanAvatar ?? null,
      }).eq('id', user.id);
    } catch (e) {
      console.warn('Profile update failed:', e);
    }
    setUser(prev => prev ? { ...prev, name: cleanName, role, avatar: cleanAvatar } : prev);
    // Also update profiles state so DM names reflect the change
    setProfiles(prev => prev.map(p => p.id === user.id ? { ...p, name: cleanName, role, avatar: cleanAvatar ?? null } : p));
    toast.success('Profile updated');
  };

  /** Soft-delete a message (sets deleted_at; RLS restricts to author). */
  const deleteMessage = async (msg: Message) => {
    // Optimistic remove
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

  /** Begin inline editing of one of your own messages. */
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

  /** Save the edited text to Supabase (RLS restricts UPDATE to author). */
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
    // Optimistically update the local message; realtime UPDATE will also
    // fire and confirm the change (or correct it) from the server.
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

  const handleAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = /^video\/(mp4|webm|quicktime)$/.test(file.type);
    const isImage = /^image\/(jpeg|png|webp)$/.test(file.type);
    const maxBytes = isVideo ? 8 * 1024 * 1024 : AVATAR_MAX_BYTES; // 8MB for video, 2MB for image

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
        if (dataUrl.length > 1_500_000) { // ~1.5MB base64 limit for video
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
          toast.error('Image too large even after compression');
          return;
        }
        setPendingImage(dataUrl);
        toast('Image attached');
      };
      img.onerror = () => toast.error('Failed to read изображение');
      img.src = reader.result as string;
    };
    reader.onerror = () => toast.error('Failed to read файл');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ===========================================================================
  // Render
  // ===========================================================================

  // Пока идёт загрузка auth — показываем спиннер
  if (authLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  // Если нет пользователя — показываем AuthScreen
  if (!user) {
    return <AuthScreen onSuccess={() => {}} />;
  }

  const isAdmin = user.role === 'admin';
  const activePinned = pinned && activeRoom && pinned.room === activeRoom.id ? pinned : null;
  const items = activeRoom?.messages ?? [];
  const roomPolls = polls.filter(p => activeRoom && p.room === activeRoom.id);
  const roomAnonQs = anonQs.filter(q => !q.answered && activeRoom && q.room === activeRoom.id);

  // Группировка сообщений по дням
  const groupedItems: { date: string; items: Message[] }[] = [];
  let lastDate = '';
  for (const m of items) {
    const dl = formatDateLabel(m.ts);
    if (dl !== lastDate) {
      groupedItems.push({ date: dl, items: [m] });
      lastDate = dl;
    } else {
      groupedItems[groupedItems.length - 1].items.push(m);
    }
  }

  // Фильтрация комнат по поиску + по room_type (DM / Group / Channels)
  const filteredRooms = rooms.filter(r =>
    !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const channels = filteredRooms.filter(r => r.kind === 'channel');
  const dms = filteredRooms.filter(r => r.roomType === 'dm');
  const groups = filteredRooms.filter(r => r.roomType === 'group');
  const chats = filteredRooms.filter(r => r.kind === 'chat' && r.roomType === 'channel');

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-[100dvh] flex overflow-hidden">
        <Sidebar
          rooms={rooms}
          channels={channels}
          chats={chats}
          dms={dms}
          groups={groups}
          active={active}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelect={(id) => {
            setActive(id);
            setSidebarOpen(false);
          }}
          onAddChannel={() => setModalMode('addChannel')}
          onAddGroup={() => setModalMode('createGroup')}
          onDeleteRoom={deleteRoom}
          isAdmin={isAdmin}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          user={user}
          onLogout={handleLogout}
          onProfile={() => setModalMode('profile')}
          onlineMembers={onlineMembers}
          isConnected={isConnected}
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          onMemberClick={startDm}
          profiles={profiles}
        />

        <main className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="glass border-b border-border flex items-center gap-2 px-3 sm:px-4 h-14 shrink-0">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Menu">
              <MenuIcon className="size-5" />
            </Button>
            {activeRoom && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {activeRoom.roomType === 'dm' ? (
                    <UserIcon className="size-4 text-primary shrink-0" />
                  ) : activeRoom.roomType === 'group' ? (
                    <Users className="size-4 text-primary shrink-0" />
                  ) : activeRoom.kind === 'channel' ? (
                    <Megaphone className="size-4 text-primary shrink-0" />
                  ) : (
                    <MessageSquare className="size-4 text-primary shrink-0" />
                  )}
                  <span className="font-semibold truncate">{activeRoom.name}</span>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide hidden sm:inline-flex">
                    {activeRoom.roomType === 'dm' ? 'DM' :
                     activeRoom.roomType === 'group' ? 'Group' :
                     activeRoom.kind === 'channel' ? 'Channel' : 'Chat'}
                  </Badge>
                </div>
                {activeRoom.category === 'group' && activeRoom.groupMembers ? (
                  <div className="text-xs text-muted-foreground truncate">
                    {activeRoom.groupMembers.length} members
                  </div>
                ) : activeRoom.about && activeRoom.roomType !== 'dm' ? (
                  <div className="text-xs text-muted-foreground truncate">{activeRoom.about}</div>
                ) : null}
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Actions">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 dropdown-in">
                {activePinned && (
                  <DropdownMenuItem onClick={unpin}>
                    <X className="size-4 mr-2" /> {t('room.unpin')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setModalMode('pin')}>
                  <Pin className="size-4 mr-2" /> {t('room.pin')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModalMode('poll')}>
                  <BarChart3 className="size-4 mr-2" /> {t('poll.new')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModalMode('anon')}>
                  <EyeOff className="size-4 mr-2" /> {t('anon.new')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setModalMode('info')}>
                  <Info className="size-4 mr-2" /> Info
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModalMode('profile')}>
                  <UserIcon className="size-4 mr-2" /> {t('nav.openProfile')}
                </DropdownMenuItem>
                {/* Delete: channels for admin; DMs/groups for creator or admin */}
                {activeRoom && (activeRoom.roomType === 'channel' ? isAdmin : true) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => {
                      if (confirm(`Delete «${activeRoom.name}»?`)) deleteRoom(activeRoom.id);
                    }}>
                      <Trash2 className="size-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          {/* Pinned banner */}
          {activePinned && (
            <div className="glass border-b border-border px-3 sm:px-4 py-2 flex items-start gap-2 text-sm slide-down">
              <Pin className="size-4 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-muted-foreground text-xs uppercase tracking-wide mr-2">{t('room.pinned')}</span>
                <span className="break-words">{activePinned.text}</span>
              </div>
              <Button variant="ghost" size="icon" className="size-6" onClick={unpin} aria-label={t('room.unpin')}>
                <X className="size-3" />
              </Button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto scroll-thin px-3 sm:px-4 py-4">
            <div key={active} className="max-w-3xl mx-auto flex flex-col gap-3 room-switch">
              {loadingRooms && (
                <div className="text-center text-muted-foreground py-20 fade-in">
                  <div className="size-8 mx-auto mb-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm">Loading…</p>
                </div>
              )}
              {!loadingRooms && groupedItems.length === 0 && roomPolls.length === 0 && roomAnonQs.length === 0 && (
                <div className="text-center text-muted-foreground py-20 fade-in">
                  <MessageSquare className="size-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">{t('room.empty')}</p>
                  <p className="text-xs mt-1">{t('room.emptyHint')}</p>
                </div>
              )}

              {groupedItems.map((group, gi) => (
                <div key={gi} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 my-2 fade-in">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">{group.date}</span>
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
                        isEditing={editMsg?.id === it.id}
                        editText={editMsg?.id === it.id ? editText : (it.text ?? '')}
                        onEditChange={setEditText}
                        onEditSave={saveEdit}
                        onEditCancel={cancelEdit}
                        onReply={(m) => setReplyTo(m)}
                        onForward={(m) => { setForwardMsg(m); setModalMode('forward'); }}
                        onPin={() => setModalMode('pin')}
                        onUnpin={activePinned ? unpin : undefined}
                        onDelete={(m) => deleteMessage(m)}
                        onEdit={(m) => startEdit(m)}
                        onCopy={(text) => {
                          navigator.clipboard?.writeText(text);
                          toast(t('msg.copied'));
                        }}
                        t={t}
                      />
                    );
                  })}
                </div>
              ))}

              {activeRoom?.kind === 'chat' && roomPolls.map(p => (
                <PollCard key={p.id} poll={p} currentUserId={user.id} onVote={votePoll} />
              ))}

              {activeRoom?.kind === 'chat' && roomAnonQs.map(q => (
                <AnonCard key={q.id} q={q} onAnswer={answerAnon} />
              ))}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Composer */}
          <div className="glass border-t border-border p-3 sm:p-4">
            <div className="max-w-3xl mx-auto">
              {/* Reply preview */}
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border text-xs">
                  <Reply className="size-3.5 text-primary shrink-0" />
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
                <div className="mb-2 flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border text-xs">
                  <Forward className="size-3.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-muted-foreground">{t('msg.forwardingFrom')} </span>
                    <span className="font-medium">{forwardMsg.authorName}: </span>
                    <span className="text-muted-foreground truncate">{forwardMsg.text?.slice(0, 60) || '...'}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="size-5 shrink-0" onClick={() => setForwardMsg(null)}>
                    <X className="size-3" />
                  </Button>
                </div>
              )}
              {pendingImage && (
                <div className="mb-2 inline-block relative">
                  {pendingMediaType === 'video' ? (
                    <video src={pendingImage} className="max-h-32 rounded-lg border border-border" controls preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pendingImage} alt="attachment" className="max-h-32 rounded-lg border border-border" />
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 size-6"
                    onClick={() => { setPendingImage(undefined); setPendingMediaType('image'); }}
                    aria-label="Remove attachment"
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                  onChange={handleAttach}
                  className="hidden"
                />
                {/* Toolbar buttons */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()} aria-label={t('msg.attachImage')}>
                      <ImagePlus className="size-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('msg.attachImage')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setModalMode('poll')} aria-label={t('poll.new')}>
                      <BarChart3 className="size-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('poll.new')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setModalMode('anon')} aria-label={t('anon.new')}>
                      <EyeOff className="size-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('anon.new')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={anon ? 'secondary' : 'ghost'}
                      size="icon"
                      className={`shrink-0 ${anon ? 'text-primary border border-primary/40' : ''}`}
                      onClick={toggleAnon}
                      aria-label={t('msg.anonymous')}
                    >
                      <EyeOff className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{anon ? t('msg.anonModeOn') : t('msg.sendAnon')}</TooltipContent>
                </Tooltip>
                <Textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={t('msg.typePlaceholder')}
                  rows={1}
                  className="resize-none min-h-[42px] max-h-32 flex-1"
                  maxLength={MAX_MSG_LEN}
                />
                <Button
                  size="icon"
                  className="shrink-0"
                  onClick={sendMessage}
                  disabled={!inputValue.trim() && !pendingImage}
                  aria-label="Send"
                >
                  <Send className="size-5" />
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {modalMode === 'addChannel' && (
        <AddRoomModal onClose={() => setModalMode(null)} onCreate={createRoom} />
      )}
      {modalMode === 'createGroup' && (
        <CreateGroupModal
          onClose={() => setModalMode(null)}
          onCreate={createGroup}
          profiles={profiles}
          currentUserId={user.id}
        />
      )}
      {modalMode === 'forward' && forwardMsg && (
        <ForwardModal
          onClose={() => { setModalMode(null); setForwardMsg(null); }}
          onForward={forwardToRoom}
          rooms={rooms}
          currentRoomId={activeRoom?.id}
        />
      )}
      {modalMode === 'pin' && (
        <PinModal onClose={() => setModalMode(null)} onPin={pinMessage} roomName={activeRoom?.name || ''} />
      )}
      {modalMode === 'poll' && (
        <PollModal onClose={() => setModalMode(null)} onCreate={createPoll} />
      )}
      {modalMode === 'anon' && (
        <AnonModal onClose={() => setModalMode(null)} onAsk={askAnon} />
      )}
      {modalMode === 'profile' && (
        <ProfileModal
          onClose={() => setModalMode(null)}
          onSave={updateProfile}
          user={user}
        />
      )}
      {modalMode === 'info' && activeRoom && (
        <InfoModal
          onClose={() => setModalMode(null)}
          room={activeRoom}
          members={activeRoom.roomType === 'group'
            ? Math.max(roomMemberships.filter(m => m.room_id === activeRoom.id).length, 1)
            : profiles.length}
          isAdmin={isAdmin}
          onDelete={(activeRoom.roomType === 'channel' ? isAdmin : true) ? () => { deleteRoom(activeRoom.id); setModalMode(null); } : undefined}
        />
      )}
    </TooltipProvider>
  );
}

// ============================================================================
// Sidebar — 3 sections: DMs / Groups / Channels (+ plain chats)
// ============================================================================

function Sidebar(props: {
  rooms: Room[];
  channels: Room[];
  chats: Room[];
  dms: Room[];
  groups: Room[];
  active: string;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onSelect: (id: string) => void;
  onAddChannel: () => void;
  onAddGroup: () => void;
  onDeleteRoom?: (id: string) => void;
  isAdmin: boolean;
  open: boolean;
  onClose: () => void;
  user: User;
  onLogout: () => void;
  onProfile: () => void;
  onlineMembers: OnlineMember[];
  isConnected: boolean;
  activeTab: 'rooms' | 'members';
  onTabChange: (tab: 'rooms' | 'members') => void;
  onMemberClick: (userId: string) => void;
  profiles: DbProfile[];
}) {
  const {
    channels, chats, dms, groups, active, searchQuery, onSearchChange, onSelect, onAddChannel,
    onAddGroup, onDeleteRoom, open, onClose, user, onLogout, onProfile,
    onlineMembers, isConnected, activeTab, onTabChange, onMemberClick, profiles,
  } = props;

  return (
    <>
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={onClose} aria-hidden />
      )}
      <aside
        className={`glass border-r border-border flex flex-col w-[280px] shrink-0
          fixed md:static inset-y-0 left-0 z-50 transition-transform
          ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Brand + connection status */}
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div
            className="size-10 rounded-xl flex items-center justify-center font-extrabold text-lg shrink-0"
            style={{ background: 'linear-gradient(135deg, #f5a623, #e94e6a)', color: '#0a0e1a' }}
          >
            H
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold leading-tight truncate">Holler</div>
            <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
              {isConnected ? (
                <><Wifi className="size-3 text-green-500" /> online: {onlineMembers.length}</>
              ) : (
                <><WifiOff className="size-3 text-destructive connection-pulse" /> offline</>
              )}
            </div>
          </div>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => onTabChange('rooms')}
            className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5
              ${activeTab === 'rooms'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'}`}
          >
            <MessageSquare className="size-3.5" /> Rooms
          </button>
          <button
            type="button"
            onClick={() => onTabChange('members')}
            className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5
              ${activeTab === 'members'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Users className="size-3.5" /> Members
            {onlineMembers.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 tabular-nums">
                {onlineMembers.length}
              </Badge>
            )}
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'rooms' ? (
          <>
            {/* Search */}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search rooms"
                  className="pl-9 h-9"
                />
              </div>
            </div>

            {/* Rooms list — 4 sections: DMs, Groups, Chats, Channels */}
            <div className="flex-1 overflow-y-auto scroll-thin p-2">
              {/* DMs section */}
              <div className="flex items-center justify-between px-2 py-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <UserIcon className="size-3" /> Direct
                </span>
              </div>
              <div className="flex flex-col gap-0.5 mb-3">
                {dms.length === 0 && (
                  <div className="text-xs text-muted-foreground px-3 py-2">Open a member's profile to start a DM</div>
                )}
                {dms.map(c => (
                  <RoomItem
                    key={c.id}
                    room={c}
                    active={c.id === active}
                    onClick={() => onSelect(c.id)}
                    onDelete={onDeleteRoom}
                  />
                ))}
              </div>

              {/* Groups section */}
              <div className="flex items-center justify-between px-2 py-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Users className="size-3" /> Groups
                </span>
                <Button variant="ghost" size="icon" className="size-6" onClick={onAddGroup} aria-label="Create group">
                  <Plus className="size-4" />
                </Button>
              </div>
              <div className="flex flex-col gap-0.5 mb-3">
                {groups.length === 0 && (
                  <div className="text-xs text-muted-foreground px-3 py-2">No groups yet — click + to create one</div>
                )}
                {groups.map(c => (
                  <RoomItem
                    key={c.id}
                    room={c}
                    active={c.id === active}
                    onClick={() => onSelect(c.id)}
                    onDelete={onDeleteRoom}
                  />
                ))}
              </div>

              {/* Chats section (kind='chat' but not dm/group) */}
              <div className="flex items-center justify-between px-2 py-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <MessageSquare className="size-3" /> Chats
                </span>
                <Button variant="ghost" size="icon" className="size-6" onClick={onAddChannel} aria-label="Create chat">
                  <Plus className="size-4" />
                </Button>
              </div>
              <div className="flex flex-col gap-0.5 mb-3">
                {chats.length === 0 && (
                  <div className="text-xs text-muted-foreground px-3 py-2">No chats</div>
                )}
                {chats.map(c => (
                  <RoomItem
                    key={c.id}
                    room={c}
                    active={c.id === active}
                    onClick={() => onSelect(c.id)}
                    onDelete={onDeleteRoom}
                  />
                ))}
              </div>

              {/* Channels section */}
              <div className="flex items-center justify-between px-2 py-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Megaphone className="size-3" /> Channels
                </span>
                <Button variant="ghost" size="icon" className="size-6" onClick={onAddChannel} aria-label="Create channel">
                  <Plus className="size-4" />
                </Button>
              </div>
              <div className="flex flex-col gap-0.5">
                {channels.length === 0 && (
                  <div className="text-xs text-muted-foreground px-3 py-2">No channels</div>
                )}
                {channels.map(c => (
                  <RoomItem
                    key={c.id}
                    room={c}
                    active={c.id === active}
                    onClick={() => onSelect(c.id)}
                    onDelete={onDeleteRoom}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <MembersList
            members={onlineMembers}
            currentUserId={user.id}
            isConnected={isConnected}
            onMemberClick={onMemberClick}
            profiles={profiles}
          />
        )}

        {/* User footer — кликабельный профиль */}
        <div className="p-3 border-t border-border">
          <button
            onClick={onProfile}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/60 transition-colors text-left"
            aria-label="Open profile"
          >
            <Avatar user={user} size={36} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {user.role === 'admin' ? (
                  <><Badge variant="secondary" className="text-[10px] px-1 py-0 h-3.5">ADMIN</Badge> admin privileges</>
                ) : (
                  'Member'
                )}
              </div>
            </div>
            <Settings className="size-4 text-muted-foreground shrink-0" />
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 text-muted-foreground justify-start"
            onClick={onLogout}
          >
            <LogOut className="size-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
    </>
  );
}

// ============================================================================
// MembersList — список участников (онлайн + все зарегистрированные)
// ============================================================================

function MembersList(props: {
  members: OnlineMember[];
  currentUserId: string;
  isConnected: boolean;
  onMemberClick: (userId: string) => void;
  profiles: DbProfile[];
}) {
  const { members, currentUserId, isConnected, onMemberClick, profiles } = props;
  // Merge online members with all profiles (so offline users are also clickable for DM)
  const onlineIds = new Set(members.map(m => m.userId));
  const allUsers = [
    ...members.map(m => ({ id: m.userId, name: m.name, role: m.role as 'member' | 'admin', avatar: m.avatar, online: true })),
    ...profiles
      .filter(p => !onlineIds.has(p.id))
      .map(p => ({ id: p.id, name: p.name, role: p.role, avatar: p.avatar ?? undefined, online: false })),
  ];
  // Sort: admins first, then alphabetically; current user last
  const sorted = [...allUsers].sort((a, b) => {
    if (a.id === currentUserId) return 1;
    if (b.id === currentUserId) return -1;
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (a.role !== 'admin' && b.role === 'admin') return 1;
    return a.name.localeCompare(b.name, 'en');
  });

  return (
    <div className="flex-1 overflow-y-auto scroll-thin p-2">
      <div className="px-2 py-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Users className="size-3" /> People
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {members.length} online · {allUsers.length} total
        </span>
      </div>

      {!isConnected && (
        <div className="px-3 py-2 text-center text-xs text-muted-foreground">
          <WifiOff className="size-5 mx-auto mb-1 opacity-50" />
          Connecting…
        </div>
      )}

      {sorted.length === 0 && (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          <Users className="size-6 mx-auto mb-2 opacity-50" />
          Nobody here yet
        </div>
      )}

      {sorted.map(u => {
        const isMe = u.id === currentUserId;
        return (
          <button
            key={u.id}
            type="button"
            disabled={isMe}
            onClick={() => !isMe && onMemberClick(u.id)}
            className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors text-left
              ${isMe ? 'opacity-60 cursor-default' : 'hover:bg-muted/40 cursor-pointer'}`}
          >
            <div className="relative shrink-0">
              <Avatar user={{ id: u.id, name: u.name, avatar: u.avatar }} size={32} />
              {u.online && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-green-500 border-2 border-card pulse-ring"
                  aria-label="online"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">
                {u.name}
                {isMe && <span className="text-xs text-muted-foreground ml-1.5">(you)</span>}
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                {u.role === 'admin' && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3">ADMIN</Badge>
                )}
                <span>{u.online ? 'online' : 'offline'}</span>
              </div>
            </div>
            {!isMe && (
              <MessageSquare className="size-3.5 text-muted-foreground shrink-0 opacity-50" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function RoomItem(props: { room: Room; active: boolean; onClick: () => void; onDelete?: (id: string) => void; }) {
  const { room, active, onClick, onDelete } = props;
  const Icon = room.roomType === 'dm' ? UserIcon
    : room.roomType === 'group' ? Users
    : room.kind === 'channel' ? Megaphone
    : MessageSquare;
  return (
    <div
      className={`group room-item flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer text-sm
        ${active ? 'bg-primary/15 text-foreground' : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <Icon className={`size-4 shrink-0 ${active ? 'text-primary' : ''}`} />
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{room.name}</div>
        {room.about && room.roomType !== 'dm' && (
          <div className="text-[11px] text-muted-foreground truncate">{room.about}</div>
        )}
      </div>
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="size-6 opacity-0 group-hover:opacity-100 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete «${room.name}»?`)) onDelete(room.id);
          }}
          aria-label="Delete"
        >
          <Trash2 className="size-3" />
        </Button>
      )}
    </div>
  );
}

function Avatar(props: { user: { id: string; name: string; avatar?: string }; size?: number }) {
  const { user, size = 36 } = props;
  if (user.avatar && safeDataUrl(user.avatar, 100_000)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatar}
        alt={user.name}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, background: avColor(user.id), fontSize: size * 0.4 }}
    >
      {initials(user.name)}
    </div>
  );
}

// ============================================================================
// MessageItem — с группировкой по автору
// ============================================================================

function MessageItem(props: { msg: Message; currentUserId: string; showHeader: boolean; isEditing: boolean; editText: string; onEditChange: (v: string) => void; onEditSave: () => void; onEditCancel: () => void; onReply?: (msg: Message) => void; onPin?: () => void; onUnpin?: () => void; onDelete?: (msg: Message) => void; onForward?: (msg: Message) => void; onCopy?: (text: string) => void; onEdit?: (msg: Message) => void; t: (key: string) => string }) {
  const { msg, currentUserId, showHeader, isEditing, editText, onEditChange, onEditSave, onEditCancel, onReply, onPin, onUnpin, onDelete, onForward, onCopy, onEdit, t } = props;
  const mine = msg.authorId === currentUserId;
  // mediaType comes from the real media_type column (schema v2)
  const isVideo = msg.mediaType === 'video';
  const safeImage = safeDataUrl(msg.image);

  return (
    <MessageContextMenu isOwn={mine} hasText={Boolean(msg.text)} onReply={onReply ? () => onReply(msg) : undefined} onPin={onPin} onUnpin={onUnpin} onDelete={onDelete ? () => onDelete(msg) : undefined} onForward={onForward ? () => onForward(msg) : undefined} onCopy={onCopy && msg.text ? () => onCopy(msg.text) : undefined} onEdit={onEdit && mine && msg.text ? () => onEdit(msg) : undefined} t={t}>
    <div className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''} ${showHeader ? 'mt-2' : 'mt-0.5'}`}>
      <div className="w-9 shrink-0 flex justify-center">
        {showHeader ? (
          <div
            className="rounded-full flex items-center justify-center font-bold text-white size-9"
            style={{
              background: msg.anon ? '#6e40c9' : avColor(msg.authorId),
              fontSize: 13,
            }}
          >
            {msg.anon ? <EyeOff className="size-4" /> : initials(msg.authorName)}
          </div>
        ) : null}
      </div>
      <div className={`max-w-[75%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        {showHeader && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1 px-1">
            <span className={msg.anon ? 'text-purple-400 font-medium' : 'text-foreground font-medium'}>
              {msg.anon ? 'Anonymous' : msg.authorName}
            </span>
            {!msg.anon && msg.role === 'admin' && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-3.5">ADMIN</Badge>
            )}
            <span className="text-muted-foreground">{formatTime(msg.ts)}</span>
            {msg.editedAt && <span className="text-muted-foreground text-[10px] italic">({t('msg.edited')})</span>}
          </div>
        )}
        <div
          className={`rounded-2xl px-3 py-2 text-sm break-words
            ${mine ? 'bg-primary text-primary-foreground ' + (showHeader ? 'rounded-tr-sm' : '')
                    : 'bg-card border border-border ' + (showHeader ? 'rounded-tl-sm' : '')}`}
        >
          {/* Reply quote (schema v2 reply_to + resolved snippet) */}
          {msg.replyTo && (
            <div className={`mb-1.5 px-2 py-1 rounded-md text-xs border-l-2 ${
              mine ? 'bg-primary-foreground/10 border-primary-foreground/60' : 'bg-muted/50 border-primary'
            }`}>
              <div className={`font-medium text-[10px] uppercase tracking-wide ${mine ? 'text-primary-foreground/80' : 'text-primary'}`}>
                {t('msg.reply')}
              </div>
              <div className={`truncate ${mine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                {msg.replySnippet ?? 'Original message'}
              </div>
            </div>
          )}
          {/* Forward quote (schema v2 forwarded_from) */}
          {msg.forwardedFrom && (
            <div className={`mb-1.5 px-2 py-1 rounded-md text-xs border-l-2 ${
              mine ? 'bg-primary-foreground/10 border-primary-foreground/60' : 'bg-muted/50 border-amber-500'
            }`}>
              <div className={`font-medium text-[10px] uppercase tracking-wide flex items-center gap-1 ${mine ? 'text-primary-foreground/80' : 'text-amber-500'}`}>
                <Forward className="size-2.5" /> {t('msg.forwardedFrom')}
              </div>
              <div className={`text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                {msg.forwardedFrom}
              </div>
            </div>
          )}
          {isEditing ? (
            <div className="flex flex-col gap-1.5 min-w-[220px]">
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => onEditChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onEditSave();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    onEditCancel();
                  }
                }}
                className={`w-full resize-none min-h-[60px] max-h-40 rounded-md p-2 text-sm outline-none
                  ${mine
                    ? 'bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/60 border border-primary-foreground/30'
                    : 'bg-background text-foreground border border-border'}`}
                maxLength={MAX_MSG_LEN}
              />
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={onEditCancel}
                >
                  {t('cancel')}
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={onEditSave}
                  disabled={!editText.trim()}
                >
                  {t('save')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
              {safeImage && isVideo ? (
                <video
                  src={safeImage}
                  controls
                  className="rounded-lg max-w-full max-h-80 mt-2"
                  preload="metadata"
                />
              ) : safeImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={safeImage}
                  alt="attachment"
                  className="rounded-lg max-w-full max-h-80 mt-2 cursor-pointer hover:opacity-90 transition-opacity"
                  loading="lazy"
                  onClick={() => window.open(safeImage, '_blank')}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
    </MessageContextMenu>
  );
}

// ============================================================================
// PollCard — переработанный с прогресс-барами
// ============================================================================

function PollCard(props: { poll: Poll; currentUserId: string; onVote: (pollId: string, optIdx: number) => void }) {
  const { poll, currentUserId, onVote } = props;
  const voted = poll.options.some(o => o.votes.includes(currentUserId));
  const myVote = poll.options.findIndex(o => o.votes.includes(currentUserId));
  const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0);

  return (
    <Card className="p-4 msg-in card-slide-in border-primary/20">
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 className="size-4 text-primary" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Poll</span>
      </div>
      <div className="font-semibold mb-3">{poll.q}</div>
      <div className="flex flex-col gap-2">
        {poll.options.map((o, i) => {
          const c = o.votes.length;
          const pct = totalVotes > 0 ? Math.round((c / totalVotes) * 100) : 0;
          const isMyVote = myVote === i;
          if (voted) {
            return (
              <div
                key={i}
                className={`relative rounded-lg overflow-hidden border p-2.5 transition-colors
                  ${isMyVote ? 'border-primary' : 'border-border'}`}
              >
                <div
                  className={`absolute inset-y-0 left-0 transition-all bar-fill
                    ${isMyVote ? 'bg-primary/20' : 'bg-muted/50'}`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {isMyVote ? (
                      <CheckCircle2 className="size-4 text-primary" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                    <span className={isMyVote ? 'font-medium' : ''}>{o.t}</span>
                  </div>
                  <span className="text-muted-foreground tabular-nums text-xs">
                    {pct}% · {c}
                  </span>
                </div>
              </div>
            );
          }
          return (
            <button
              key={i}
              className="text-left text-sm border border-border rounded-lg px-3 py-2.5 hover:border-primary hover:bg-muted/40 transition-colors flex items-center gap-2"
              onClick={() => onVote(poll.id, i)}
            >
              <Circle className="size-4 text-muted-foreground" />
              <span className="flex-1">{o.t}</span>
            </button>
          );
        })}
      </div>
      <div className="text-xs text-muted-foreground mt-3 flex items-center justify-between">
        <span>{totalVotes} {pluralize(totalVotes, 'vote', 'voteа', 'voteов')}</span>
        <span>{formatTime(poll.ts)}</span>
      </div>
    </Card>
  );
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// ============================================================================
// AnonCard — более аккуратный
// ============================================================================

function AnonCard(props: { q: AnonQuestion; onAnswer: (id: string, text: string) => void }) {
  const { q, onAnswer } = props;
  const [text, setText] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  return (
    <Card className="p-4 msg-in card-slide-in border-purple-500/20 bg-purple-500/5">
      <div className="flex items-center gap-2 mb-1">
        <EyeOff className="size-4 text-purple-400" />
        <span className="text-xs uppercase tracking-wide text-purple-400">Anonymous question</span>
      </div>
      <div className="font-medium mb-3">{q.q}</div>
      {showAnswer ? (
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ваш ответ (анонимно)"
            rows={2}
            maxLength={500}
            className="resize-none"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onAnswer(q.id, text);
                setText('');
                setShowAnswer(false);
              }}
              disabled={!text.trim()}
            >
              <Send className="size-3 mr-1" /> Reply
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAnswer(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowAnswer(true)}>
          <EyeOff className="size-3 mr-1" /> Reply anonymously
        </Button>
      )}
    </Card>
  );
}

// ============================================================================
// JoinScreen
// ============================================================================

function JoinScreen(props: { onJoin: (code: string, name: string) => Promise<boolean> }) {
  const { onJoin } = props;
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  // Textовое сообщение под полем (без подсветки самого инпута)
  const [codeMsg, setCodeMsg] = useState<string>('');
  const [nameMsg, setNameMsg] = useState<string>('');

  const submit = async () => {
    if (loading) return;
    setCodeMsg('');
    setNameMsg('');

    if (!code) {
      setCodeMsg('Enter access code');
      return;
    }
    if (!name.trim()) {
      setNameMsg('Enter your name');
      return;
    }

    setLoading(true);
    // onJoin вернёт true при успехе и сам переключит экран —
    // в этом случае мы ничего не делаем (JoinScreen размонтируется).
    const ok = await onJoin(code, name);
    if (!ok) {
      setLoading(false);
      setCodeMsg('Invalid access code');
    }
    // При успехе не сбрасываем loading и не меняем state —
    // родитель размонтирует этот экран.
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 glass">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="size-12 rounded-xl flex items-center justify-center font-extrabold text-xl shrink-0"
              style={{ background: 'linear-gradient(135deg, #f5a623, #e94e6a)', color: '#0a0e1a' }}
            >
              H
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">Holler</h1>
              <p className="text-xs text-muted-foreground">Real-time messenger</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="jc">Access code</Label>
            <Input
              id="jc"
              inputMode="numeric"
              placeholder="6 digits"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''));
                setCodeMsg('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              aria-describedby={codeMsg ? 'jc-msg' : undefined}
            />
            {codeMsg && (
              <p
                id="jc-msg"
                className="text-xs mt-1.5 flex items-center gap-1 font-medium text-destructive"
              >
                <AlertCircle className="size-3.5" />
                {codeMsg}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="jn">Your name</Label>
            <Input
              id="jn"
              placeholder="How others will see you"
              maxLength={MAX_NAME_LEN}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameMsg('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              aria-describedby={nameMsg ? 'jn-msg' : undefined}
            />
            {nameMsg && (
              <p
                id="jn-msg"
                className="text-xs mt-1.5 flex items-center gap-1 font-medium text-destructive"
              >
                <AlertCircle className="size-3.5" />
                {nameMsg}
              </p>
            )}
          </div>
          <Button className="w-full" onClick={submit} disabled={loading || !code || !name.trim()}>
            {loading ? 'Checking…' : 'Sign in'}
          </Button>
        </div>

        <div className="mt-5 p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground leading-relaxed">
          Access codes verified server-side and not visible in the browser. Rate-limited to 10 attempts per minute.
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// ThemeToggle — переключатель светлой/тёмной темы
// ============================================================================

function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    setMounted(true);
    const stored = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    setTheme(stored);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try { localStorage.setItem('theme', next); } catch {}
  };

  if (!mounted) {
    return <div className="size-9" />;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="shrink-0"
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

// ============================================================================
// Modals
// ============================================================================

function ModalShell(props: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="glass modal-pop">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          {props.description && <DialogDescription>{props.description}</DialogDescription>}
        </DialogHeader>
        {props.children}
        {props.footer && <DialogFooter>{props.footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

function AddRoomModal(props: { onClose: () => void; onCreate: (name: string, about: string, category: string, kind: RoomKind) => void }) {
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [category, setCategory] = useState<string>('general');
  const [kind, setKind] = useState<RoomKind>('channel');

  return (
    <ModalShell
      title="New room"
      description="A channel is a one-way feed (author writes, everyone reads). A chat is for everyone to talk."
      onClose={props.onClose}
      footer={
        <Button onClick={() => { props.onCreate(name, about, category, kind); props.onClose(); }}>
          Create
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>Type комнаты</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-left
                ${kind === 'channel' ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'}`}
              onClick={() => setKind('channel')}
            >
              <Megaphone className="size-4" />
              <div>
                <div className="font-medium">Channel</div>
                <div className="text-xs text-muted-foreground">лента</div>
              </div>
            </button>
            <button
              type="button"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-left
                ${kind === 'chat' ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'}`}
              onClick={() => setKind('chat')}
            >
              <MessageSquare className="size-4" />
              <div>
                <div className="font-medium">Чат</div>
                <div className="text-xs text-muted-foreground">диалог</div>
              </div>
            </button>
          </div>
        </div>
        <div>
          <Label htmlFor="cn">Name</Label>
          <Input id="cn" placeholder="например: Sport" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cd">Description</Label>
          <Input id="cd" placeholder="what is this room about" maxLength={MAX_ABOUT_LEN} value={about} onChange={(e) => setAbout(e.target.value)} />
        </div>
        <div>
          <Label>Category</Label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                type="button"
                className={`px-2.5 py-1 rounded-md text-xs border transition-colors
                  ${category === c.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function PinModal(props: { onClose: () => void; onPin: (text: string) => void; roomName: string }) {
  const [text, setText] = useState('');
  return (
    <ModalShell
      title="Pin сообщение"
      description={`The pin will appear at the top of the room «${props.roomName}».`}
      onClose={props.onClose}
      footer={
        <Button onClick={() => { props.onPin(text); props.onClose(); }} disabled={!text.trim()}>
          Pin
        </Button>
      }
    >
      <div>
        <Label htmlFor="pt">Text</Label>
        <Textarea id="pt" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="What to pin?" />
      </div>
    </ModalShell>
  );
}

function PollModal(props: { onClose: () => void; onCreate: (q: string, opts: string[]) => void }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<string[]>(['', '']);
  const MAX_OPTS = 8;

  const updateOpt = (i: number, value: string) => {
    setOpts(prev => prev.map((o, idx) => (idx === i ? value.slice(0, 100) : o)));
  };
  const addOpt = () => {
    if (opts.length >= MAX_OPTS) return;
    setOpts(prev => [...prev, '']);
  };
  const removeOpt = (i: number) => {
    if (opts.length <= 2) return;
    setOpts(prev => prev.filter((_, idx) => idx !== i));
  };

  const canPublish = q.trim().length > 0 && opts.filter(o => o.trim().length > 0).length >= 2;

  const handlePublish = () => {
    const cleanOpts = opts.map(o => o.trim()).filter(Boolean);
    if (!q.trim() || cleanOpts.length < 2) return;
    props.onCreate(q.trim(), cleanOpts);
    props.onClose();
  };

  return (
    <ModalShell
      title="New poll"
      description="Question и варианты ответа. Members увидят опрос в чате."
      onClose={props.onClose}
      footer={
        <Button onClick={handlePublish} disabled={!canPublish}>
          Publish
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="pq">Question</Label>
          <Input
            id="pq"
            placeholder="When is the project due?"
            maxLength={200}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Answer options</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {opts.length}/{MAX_OPTS}
            </span>
          </div>
          <div className="space-y-2">
            {opts.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground tabular-nums w-5 text-right shrink-0">
                  {i + 1}.
                </span>
                <Input
                  value={opt}
                  onChange={(e) => updateOpt(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={100}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (i === opts.length - 1 && opts.length < MAX_OPTS) addOpt();
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 text-muted-foreground"
                  onClick={() => removeOpt(i)}
                  disabled={opts.length <= 2}
                  aria-label={`Удалить вариант ${i + 1}`}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={addOpt}
              disabled={opts.length >= MAX_OPTS}
            >
              <Plus className="size-4 mr-1" /> Add option
            </Button>
            <p className="text-xs text-muted-foreground">Min 2, max {MAX_OPTS}.</p>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function AnonModal(props: { onClose: () => void; onAsk: (q: string) => void }) {
  const [q, setQ] = useState('');
  return (
    <ModalShell
      title="Anonymous question"
      description="Community answers, anonymous stays."
      onClose={props.onClose}
      footer={
        <Button onClick={() => { props.onAsk(q); props.onClose(); }} disabled={!q.trim()}>
          Ask anonymously
        </Button>
      }
    >
      <div>
        <Label htmlFor="aq">Question</Label>
        <Textarea id="aq" rows={3} maxLength={300} value={q} onChange={(e) => setQ(e.target.value)} placeholder="What to ask the community?" />
      </div>
    </ModalShell>
  );
}

function ProfileModal(props: {
  onClose: () => void;
  onSave: (name: string, role: Role, avatar?: string) => void;
  user: User;
}) {
  const [name, setName] = useState(props.user.name);
  const [role, setRole] = useState<Role>(props.user.role);
  const [avatar, setAvatar] = useState<string | undefined>(props.user.avatar);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      toast.error('Only JPG, PNG, or WebP allowed');
      return;
    }
    if (f.size > AVATAR_MAX_BYTES) {
      toast.error('File larger than 2MB');
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = AVATAR_DIM;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, AVATAR_DIM, AVATAR_DIM);
        const url = c.toDataURL('image/jpeg', 0.85);
        if (url.length > 100_000) {
          toast.error('Image too large');
          return;
        }
        setAvatar(url);
      };
      img.src = r.result as string;
    };
    r.readAsDataURL(f);
    e.target.value = '';
  };

  return (
    <ModalShell
      title="Profile"
      description="Так вас видят в классе."
      onClose={props.onClose}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
          <Button onClick={() => { props.onSave(name, role, avatar); props.onClose(); }}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar user={{ id: props.user.id, name, avatar }} size={64} />
          <div className="flex-1">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={onFile} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4 mr-1" /> Upload
            </Button>
            {avatar && (
              <Button variant="ghost" size="sm" className="ml-2" onClick={() => setAvatar(undefined)}>
                Remove
              </Button>
            )}
            <p className="text-xs text-muted-foreground mt-1">JPG/PNG/WebP, до 2 МБ, will be cropped to circle.</p>
          </div>
        </div>
        <div>
          <Label htmlFor="pn">Имя</Label>
          <Input id="pn" maxLength={MAX_NAME_LEN} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="pr"
            checked={role === 'admin'}
            onCheckedChange={(v) => setRole(v ? 'admin' : 'member')}
          />
          <Label htmlFor="pr" className="cursor-pointer">I am an admin</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Real admin rights are granted only by the server when entering the admin code. This checkbox is for local preview only.
        </p>
      </div>
    </ModalShell>
  );
}

function InfoModal(props: {
  onClose: () => void;
  room: Room;
  members: number;
  isAdmin: boolean;
  onDelete?: () => void;
}) {
  const { room, members, isAdmin, onDelete } = props;
  const roomType = room.roomType === 'dm' ? 'Direct message'
    : room.roomType === 'group' ? 'Group'
    : room.kind === 'channel' ? 'Channel'
    : 'Chat';
  return (
    <ModalShell
      title={room.name}
      description={room.about || ''}
      onClose={props.onClose}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>Close</Button>
          {onDelete && (
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4 mr-1" /> Delete
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Type</span>
          <Badge variant="outline">{roomType}</Badge>
        </div>
        {room.roomType !== 'dm' && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Category</span>
            <span className="font-medium">{categoryLabel(room.category)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Members</span>
          <span className="font-medium tabular-nums">{members}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Messages</span>
          <span className="font-medium tabular-nums">{room.messages.length}</span>
        </div>
        {room.roomType === 'dm' ? (
          <p className="text-xs text-muted-foreground border-t border-border pt-3 mt-2">
            Private 1-on-1 conversation. Only you and the other participant can see these messages.
          </p>
        ) : room.roomType === 'group' ? (
          <p className="text-xs text-muted-foreground border-t border-border pt-3 mt-2">
            Group chat — only invited members can see this room and read messages.
          </p>
        ) : room.kind === 'channel' ? (
          <p className="text-xs text-muted-foreground border-t border-border pt-3 mt-2">
            Channel — readable by everyone. Only admins can delete.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground border-t border-border pt-3 mt-2">
            Everyone can write in chats. Polls and anonymous questions are supported.
          </p>
        )}
      </div>
    </ModalShell>
  );
}

// ============================================================================
// CreateGroupModal — name + member multiselect
// ============================================================================

function CreateGroupModal(props: {
  onClose: () => void;
  onCreate: (name: string, memberIds: string[]) => void;
  profiles: DbProfile[];
  currentUserId: string;
}) {
  const { profiles, currentUserId, onCreate, onClose } = props;
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const others = profiles.filter(p => p.id !== currentUserId);
  const filtered = others.filter(p =>
    !query || p.name.toLowerCase().includes(query.toLowerCase()),
  );

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <ModalShell
      title="New group"
      description="Pick a name and select members. You'll be added as the group admin."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onCreate(name, Array.from(selected))}
            disabled={!name.trim() || selected.size === 0}
          >
            Create group ({selected.size})
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="gn">Group name</Label>
          <Input
            id="gn"
            placeholder="e.g. Project Team"
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="gq">Add members</Label>
          <Input
            id="gq"
            placeholder="Search users…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="max-h-60 overflow-y-auto scroll-thin border border-border rounded-lg divide-y divide-border">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No users found
            </div>
          )}
          {filtered.map(p => {
            const checked = selected.has(p.id);
            return (
              <label
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(p.id)}
                />
                <Avatar user={{ id: p.id, name: p.name, avatar: p.avatar ?? undefined }} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                </div>
              </label>
            );
          })}
        </div>
        {selected.size > 0 && (
          <div className="text-xs text-muted-foreground">
            {selected.size} member{selected.size === 1 ? '' : 's'} selected
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ============================================================================
// ForwardModal — pick a destination room
// ============================================================================

function ForwardModal(props: {
  onClose: () => void;
  onForward: (roomId: string) => void;
  rooms: Room[];
  currentRoomId?: string;
}) {
  const { onForward, onClose, rooms, currentRoomId } = props;
  const [query, setQuery] = useState('');
  const filtered = rooms.filter(r =>
    r.id !== currentRoomId &&
    (!query || r.name.toLowerCase().includes(query.toLowerCase())),
  );
  return (
    <ModalShell
      title="Forward to…"
      description="Pick a destination room. The original sender's name will be quoted."
      onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>Cancel</Button>}
    >
      <div className="space-y-3">
        <Input
          placeholder="Search rooms…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-80 overflow-y-auto scroll-thin border border-border rounded-lg divide-y divide-border">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No rooms available
            </div>
          )}
          {filtered.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => onForward(r.id)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors text-left"
            >
              {r.roomType === 'dm' ? (
                <UserIcon className="size-4 shrink-0 text-primary" />
              ) : r.roomType === 'group' ? (
                <Users className="size-4 shrink-0 text-primary" />
              ) : r.kind === 'channel' ? (
                <Megaphone className="size-4 shrink-0 text-primary" />
              ) : (
                <MessageSquare className="size-4 shrink-0 text-primary" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.roomType === 'dm' ? 'Direct message'
                    : r.roomType === 'group' ? 'Group'
                    : r.kind === 'channel' ? 'Channel'
                    : 'Chat'}
                </div>
              </div>
              <Forward className="size-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}
