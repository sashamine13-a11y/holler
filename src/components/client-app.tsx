'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Send, Plus, Pin, BarChart3, EyeOff, Trash2, Info, User as UserIcon,
  Menu as MenuIcon, LogOut, ImagePlus, Hash, MessageSquare, MoreVertical,
  Search, ChevronRight, Settings, Megaphone, BookOpen, ShoppingBag, Sparkles,
  CheckCircle2, Circle, X, Users, AlertCircle, Sun, Moon, Wifi, WifiOff,
} from 'lucide-react';

// ============================================================================
// Typeы
// ============================================================================

type Role = 'member' | 'admin';
type RoomKind = 'channel' | 'chat';
type ModalMode = 'addChannel' | 'pin' | 'poll' | 'anon' | 'profile' | 'info' | null;

interface User {
  id: string;
  name: string;
  role: Role;
  avatar?: string;
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
}

interface Room {
  id: string;
  name: string;
  kind: RoomKind;
  category?: string; // короткая текстовая метка вместо эмодзи
  about?: string;
  messages: Message[];
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
  { id: 'c_ann', name: 'Announcements', kind: 'channel', category: 'announcements', about: 'Schedule changes, deadlines, important stuff', messages: [] },
  { id: 'c_life', name: 'Class Life', kind: 'channel', category: 'life', about: 'Photos, stories, memes', messages: [] },
  { id: 'c_study', name: 'Study', kind: 'channel', category: 'study', about: 'Homework, notes, cheat sheets', messages: [] },
  { id: 'c_shop', name: 'Marketplace', kind: 'channel', category: 'shop', about: 'Sell, buy, give away', messages: [] },
  { id: 'g_main', name: 'General Chat', kind: 'chat', category: 'general', about: 'Class communication', messages: [] },
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
// Загрузка/сохранение (с миграцией из v1)
// ============================================================================

function loadState(): AppState {
  const base: AppState = {
    user: null,
    rooms: DEFAULT_ROOMS,
    active: 'g_main',
    anon: false,
    pinned: null,
    polls: [],
    anonQs: [],
  };
  if (typeof window === 'undefined') return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<AppState>;
    return {
      user: p.user ?? null,
      rooms: Array.isArray(p.rooms) && p.rooms.length ? p.rooms : DEFAULT_ROOMS,
      active: typeof p.active === 'string' ? p.active : 'g_main',
      anon: !!p.anon,
      pinned: p.pinned ?? null,
      polls: Array.isArray(p.polls) ? p.polls : [],
      anonQs: Array.isArray(p.anonQs) ? p.anonQs : [],
    };
  } catch {
    return base;
  }
}

function saveState(s: AppState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    toast.error('Failed to save — возможно, переполнен localStorage');
  }
}

// ============================================================================
// Главный компонент
// ============================================================================

export default function ClientApp() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [pendingImage, setPendingImage] = useState<string | undefined>();
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Sidebar tab: 'rooms' (channels and chats) | 'members' (online list)
  const [sidebarTab, setSidebarTab] = useState<'rooms' | 'members'>('rooms');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth via Supabase
  const { user: authUser, loading: authLoading } = useAuth();

  // Sync auth user with state.user
  useEffect(() => {
    if (authUser) {
      setState(prev => {
        if (prev.user && prev.user.id === authUser.id && prev.user.name === authUser.name) {
          return prev;
        }
        return {
          ...prev,
          user: {
            id: authUser.id,
            name: authUser.name,
            role: authUser.role,
            avatar: authUser.avatar,
          },
        };
      });
    } else if (!authLoading) {
      setState(prev => prev.user ? { ...prev, user: null } : prev);
    }
  }, [authUser, authLoading]);

  // WebSocket-хук для реального времени
  const { socket, isConnected, onlineMembers } = useSocket({ user: state.user });

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.rooms, state.active]);

  // ===========================================================================
  // WebSocket: подписка на входящие события
  // ===========================================================================
  // Ref для отслеживания уже обработанных сообщений (анти-дублирование)
  const processedMsgIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!socket) return;

    const onMessageNew = (payload: { roomId: string; message: Message }) => {
      if (!payload?.message) return;
      const msg = payload.message;
      // Анти-дублирование: пропускаем если уже обработали это сообщение
      if (processedMsgIds.current.has(msg.id)) return;
      processedMsgIds.current.add(msg.id);
      // Не дублируем своё же сообщение (уже добавлено локально в sendMessage)
      if (msg.authorId === state.user?.id) return;
      setState(prev => ({
        ...prev,
        rooms: prev.rooms.map(r =>
          r.id === payload.roomId
            ? { ...r, messages: [...r.messages, msg] }
            : r,
        ),
      }));
    };

    const onPollNew = (payload: { poll: Poll }) => {
      if (!payload?.poll) return;
      setState(prev => ({
        ...prev,
        polls: prev.polls.find(p => p.id === payload.poll.id)
          ? prev.polls
          : [...prev.polls, payload.poll],
      }));
    };

    const onPollVote = (payload: { pollId: string; optionIndex: number; voterId: string }) => {
      if (!payload?.pollId) return;
      setState(prev => ({
        ...prev,
        polls: prev.polls.map(p => {
          if (p.id !== payload.pollId) return p;
          if (p.options.some(o => o.votes.includes(payload.voterId))) return p;
          return {
            ...p,
            options: p.options.map((o, i) =>
              i === payload.optionIndex
                ? { ...o, votes: [...o.votes, payload.voterId] }
                : o,
            ),
          };
        }),
      }));
    };

    const onPinUpdate = (payload: { pinned: Pinned | null }) => {
      setState(prev => ({ ...prev, pinned: payload.pinned ?? null }));
    };

    const onRoomUpdate = () => {
      // Уведомляем пользователя что список комнат мог измениться
      toast('Room list updated');
    };

    socket.on('message:new', onMessageNew);
    socket.on('poll:new', onPollNew);
    socket.on('poll:vote', onPollVote);
    socket.on('pin:update', onPinUpdate);
    socket.on('room:update', onRoomUpdate);

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('poll:new', onPollNew);
      socket.off('poll:vote', onPollVote);
      socket.off('pin:update', onPinUpdate);
      socket.off('room:update', onRoomUpdate);
    };
  }, [socket]);

  // ===========================================================================
  // Auth
  // ===========================================================================

  const handleJoin = async (code: string, name: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Login error');
        return false;
      }
      const user: User = { id: uid('u'), name: data.user.name, role: data.user.role };
      setState(prev => ({ ...prev, user }));
      setShowJoin(false);
      toast.success(`Welcome, ${user.name}!`);
      return true;
    } catch {
      toast.error('Network unavailable');
      return false;
    }
  };

  const handleLogout = async () => {
    // Supabase signOut через useAuth
    try {
      const { supabase } = await import('@/lib/supabase');
      if (supabase) await supabase.auth.signOut();
    } catch {}
    setState(prev => ({ ...prev, user: null }));
    toast('Signed out');
  };

  // ===========================================================================
  // Actions
  // ===========================================================================

  const activeRoom = useMemo(() => state.rooms.find(r => r.id === state.active) ?? state.rooms[0], [state.rooms, state.active]);

  const sendMessage = () => {
    if (!state.user || !activeRoom) return;
    const cleanText = sanitizeText(inputValue, MAX_MSG_LEN);
    if (!cleanText && !pendingImage) return;
    const msg: Message = {
      id: uid('m'),
      authorId: state.user.id,
      authorName: state.user.name,
      role: state.user.role,
      text: cleanText,
      ts: Date.now(),
      anon: state.anon,
      image: safeDataUrl(pendingImage),
    };
    setState(prev => ({
      ...prev,
      rooms: prev.rooms.map(r =>
        r.id === activeRoom.id ? { ...r, messages: [...r.messages, msg] } : r,
      ),
      anon: false,
    }));
    // Broadcast через WebSocket
    socket?.emit('message:new', { roomId: activeRoom.id, message: msg });
    setInputValue('');
    setPendingImage(undefined);
  };

  const toggleAnon = () => setState(prev => ({ ...prev, anon: !prev.anon }));

  const deleteRoom = (id: string) => {
    setState(prev => ({
      ...prev,
      rooms: prev.rooms.filter(r => r.id !== id),
      active: prev.active === id ? 'g_main' : prev.active,
    }));
    toast('Room deleted');
  };

  const createRoom = (name: string, about: string, category: string, kind: RoomKind) => {
    const cleanName = sanitizeText(name, 32);
    if (!cleanName) {
      toast.error('Введите название');
      return;
    }
    const newRoom: Room = {
      id: uid(kind === 'channel' ? 'c' : 'g'),
      name: cleanName,
      kind,
      category,
      about: sanitizeText(about, MAX_ABOUT_LEN),
      messages: [],
    };
    setState(prev => ({ ...prev, rooms: [...prev.rooms, newRoom] }));
    toast.success(kind === 'channel' ? `Channel «${cleanName}» created` : `Chat «${cleanName}» created`);
  };

  const pinMessage = (text: string) => {
    if (!activeRoom) return;
    const clean = sanitizeText(text, 500);
    if (!clean) {
      toast.error('Enter text');
      return;
    }
    const pinned: Pinned = { room: activeRoom.id, text: clean, ts: Date.now() };
    setState(prev => ({ ...prev, pinned }));
    socket?.emit('pin:update', { pinned });
    toast('Message pinned');
  };

  const unpin = () => {
    setState(prev => ({ ...prev, pinned: null }));
    socket?.emit('pin:update', { pinned: null });
    toast('Pin removed');
  };

  const createPoll = (q: string, optionsArr: string[]) => {
    if (!activeRoom || !state.user) return;
    const cleanQ = sanitizeText(q, 200);
    const opts = optionsArr
      .map(s => sanitizeText(s, 100))
      .filter(Boolean)
      .slice(0, 8);
    if (!cleanQ || opts.length < 2) {
      toast.error('Нужен вопрос и минимум 2 варианта');
      return;
    }
    const poll: Poll = {
      id: uid('p'),
      room: activeRoom.id,
      q: cleanQ,
      options: opts.map(t => ({ t, votes: [] })),
      ts: Date.now(),
      authorId: state.user.id,
    };
    setState(prev => ({ ...prev, polls: [...prev.polls, poll] }));
    socket?.emit('poll:new', { poll });
    toast.success('Poll published');
  };

  const votePoll = (pollId: string, optIdx: number) => {
    if (!state.user) return;
    setState(prev => ({
      ...prev,
      polls: prev.polls.map(p => {
        if (p.id !== pollId) return p;
        if (p.options.some(o => o.votes.includes(state.user!.id))) return p;
        return {
          ...p,
          options: p.options.map((o, i) =>
            i === optIdx ? { ...o, votes: [...o.votes, state.user!.id] } : o,
          ),
        };
      }),
    }));
    socket?.emit('poll:vote', { pollId, optionIndex: optIdx, voterId: state.user.id });
  };

  const askAnon = (q: string) => {
    if (!activeRoom || !state.user) return;
    const cleanQ = sanitizeText(q, 300);
    if (!cleanQ) {
      toast.error('Enter a question');
      return;
    }
    const aq: AnonQuestion = {
      id: uid('a'),
      room: activeRoom.id,
      q: cleanQ,
      answers: [],
      answered: false,
      authorId: state.user.id,
    };
    setState(prev => ({ ...prev, anonQs: [...prev.anonQs, aq] }));
    toast.success('Anonymous question sent');
  };

  const answerAnon = (aqId: string, text: string) => {
    if (!state.user) return;
    const clean = sanitizeText(text, 500);
    if (!clean) return;
    setState(prev => ({
      ...prev,
      anonQs: prev.anonQs.map(q =>
        q.id === aqId
          ? { ...q, answers: [...q.answers, { text: clean, ts: Date.now() }], answered: true }
          : q,
      ),
    }));
    toast.success('Answer sent anonymously');
  };

  const updateProfile = (name: string, role: Role, avatar?: string) => {
    if (!state.user) return;
    const cleanName = sanitizeText(name, MAX_NAME_LEN);
    if (!cleanName) {
      toast.error('Name cannot be empty');
      return;
    }
    setState(prev => ({
      ...prev,
      user: prev.user
        ? { ...prev.user, name: cleanName, role, avatar: safeDataUrl(avatar, 100_000) }
        : prev.user,
    }));
    toast.success('Profile updated');
  };

  const handleAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('Only JPG, PNG, or WebP allowed');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error('File larger than 2MB');
      return;
    }
    const reader = new FileReader();
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
  if (!state.user) {
    return <AuthScreen onSuccess={() => {}} />;
  }

  const isAdmin = state.user.role === 'admin';
  const pinned = state.pinned && activeRoom && state.pinned.room === activeRoom.id ? state.pinned : null;
  const items = activeRoom?.messages ?? [];
  const roomPolls = state.polls.filter(p => activeRoom && p.room === activeRoom.id);
  const roomAnonQs = state.anonQs.filter(q => !q.answered && activeRoom && q.room === activeRoom.id);

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

  // Фильтрация комнат по поиску
  const filteredRooms = state.rooms.filter(r =>
    !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const channels = filteredRooms.filter(r => r.kind === 'channel');
  const chats = filteredRooms.filter(r => r.kind === 'chat');

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-[100dvh] flex overflow-hidden">
        <Sidebar
          rooms={state.rooms}
          channels={channels}
          chats={chats}
          active={state.active}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelect={(id) => {
            setState(prev => ({ ...prev, active: id }));
            setSidebarOpen(false);
          }}
          onAddChannel={() => setModalMode('addChannel')}
          onDeleteRoom={isAdmin ? deleteRoom : undefined}
          isAdmin={isAdmin}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          user={state.user}
          onLogout={handleLogout}
          onProfile={() => setModalMode('profile')}
          onlineMembers={onlineMembers}
          isConnected={isConnected}
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
        />

        <main className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="glass border-b border-border flex items-center gap-2 px-3 sm:px-4 h-14 shrink-0">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Меню">
              <MenuIcon className="size-5" />
            </Button>
            {activeRoom && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {activeRoom.kind === 'channel' ? (
                    <Megaphone className="size-4 text-primary shrink-0" />
                  ) : (
                    <MessageSquare className="size-4 text-primary shrink-0" />
                  )}
                  <span className="font-semibold truncate">{activeRoom.name}</span>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide hidden sm:inline-flex">
                    {activeRoom.kind === 'channel' ? 'Channel' : 'Chat'}
                  </Badge>
                </div>
                {activeRoom.about && (
                  <div className="text-xs text-muted-foreground truncate">{activeRoom.about}</div>
                )}
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Actions">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 dropdown-in">
                {pinned && (
                  <DropdownMenuItem onClick={unpin}>
                    <X className="size-4 mr-2" /> Unpin
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setModalMode('pin')}>
                  <Pin className="size-4 mr-2" /> Pin
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModalMode('poll')}>
                  <BarChart3 className="size-4 mr-2" /> Create poll
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModalMode('anon')}>
                  <EyeOff className="size-4 mr-2" /> Anonymous question
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setModalMode('info')}>
                  <Info className="size-4 mr-2" /> Info
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModalMode('profile')}>
                  <UserIcon className="size-4 mr-2" /> Profile
                </DropdownMenuItem>
                {activeRoom?.kind === 'channel' && isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => {
                      if (confirm(`Delete channel «${activeRoom.name}»?`)) deleteRoom(activeRoom.id);
                    }}>
                      <Trash2 className="size-4 mr-2" /> Delete channel
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          {/* Pinned banner */}
          {pinned && (
            <div className="glass border-b border-border px-3 sm:px-4 py-2 flex items-start gap-2 text-sm slide-down">
              <Pin className="size-4 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-muted-foreground text-xs uppercase tracking-wide mr-2">Закреп</span>
                <span className="break-words">{pinned.text}</span>
              </div>
              <Button variant="ghost" size="icon" className="size-6" onClick={unpin} aria-label="Unpin">
                <X className="size-3" />
              </Button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto scroll-thin px-3 sm:px-4 py-4">
            <div key={state.active} className="max-w-3xl mx-auto flex flex-col gap-3 room-switch">
              {groupedItems.length === 0 && roomPolls.length === 0 && roomAnonQs.length === 0 && (
                <div className="text-center text-muted-foreground py-20 fade-in">
                  <MessageSquare className="size-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">Nothing here yet</p>
                  <p className="text-xs mt-1">Be the first to write or pin a message</p>
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
                        currentUserId={state.user!.id}
                        showHeader={showHeader}
                      />
                    );
                  })}
                </div>
              ))}

              {activeRoom?.kind === 'chat' && roomPolls.map(p => (
                <PollCard key={p.id} poll={p} currentUserId={state.user!.id} onVote={votePoll} />
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
              {pendingImage && (
                <div className="mb-2 inline-block relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pendingImage} alt="Прикрепление" className="max-h-32 rounded-lg border border-border" />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 size-6"
                    onClick={() => setPendingImage(undefined)}
                    aria-label="Remove изображение"
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAttach}
                  className="hidden"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach image"
                >
                  <ImagePlus className="size-5" />
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={state.anon ? 'secondary' : 'ghost'}
                      size="icon"
                      className={`shrink-0 ${state.anon ? 'text-primary border border-primary/40' : ''}`}
                      onClick={toggleAnon}
                      aria-label="Anonymous"
                    >
                      <EyeOff className="size-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{state.anon ? 'Anonymous mode on' : 'Send анонимно'}</TooltipContent>
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
                  placeholder="Type a message…"
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
          user={state.user}
        />
      )}
      {modalMode === 'info' && activeRoom && (
        <InfoModal
          onClose={() => setModalMode(null)}
          room={activeRoom}
          members={27}
          isAdmin={isAdmin}
          onDelete={isAdmin && activeRoom.kind === 'channel' ? () => { deleteRoom(activeRoom.id); setModalMode(null); } : undefined}
        />
      )}
    </TooltipProvider>
  );
}

// ============================================================================
// Sidebar — текстовое меню
// ============================================================================

function Sidebar(props: {
  rooms: Room[];
  channels: Room[];
  chats: Room[];
  active: string;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onSelect: (id: string) => void;
  onAddChannel: () => void;
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
}) {
  const {
    channels, chats, active, searchQuery, onSearchChange, onSelect, onAddChannel,
    onDeleteRoom, isAdmin, open, onClose, user, onLogout, onProfile,
    onlineMembers, isConnected, activeTab, onTabChange,
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

            {/* Rooms list */}
            <div className="flex-1 overflow-y-auto scroll-thin p-2">
              {/* Channels section */}
              <div className="flex items-center justify-between px-2 py-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Megaphone className="size-3" /> Channels
                </span>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="size-6" onClick={onAddChannel} aria-label="Create channel">
                    <Plus className="size-4" />
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-0.5 mb-3">
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

              {/* Chats section */}
              <div className="flex items-center justify-between px-2 py-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <MessageSquare className="size-3" /> Chats
                </span>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="size-6" onClick={onAddChannel} aria-label="Create chat">
                    <Plus className="size-4" />
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
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
            </div>
          </>
        ) : (
          <MembersList members={onlineMembers} currentUserId={user.id} isConnected={isConnected} />
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
                  <><Badge variant="secondary" className="text-[10px] px-1 py-0 h-3.5">АДМИН</Badge> admin privileges</>
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
// MembersList — реальный список онлайн-участников
// ============================================================================

function MembersList(props: { members: OnlineMember[]; currentUserId: string; isConnected: boolean }) {
  const { members, currentUserId, isConnected } = props;
  // Сортируем: админы сверху, потом по имени
  const sorted = [...members].sort((a, b) => {
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (a.role !== 'admin' && b.role === 'admin') return 1;
    return a.name.localeCompare(b.name, 'ru');
  });

  return (
    <div className="flex-1 overflow-y-auto scroll-thin p-2">
      <div className="px-2 py-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Users className="size-3" /> Онлайн сейчас
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{members.length}</span>
      </div>

      {!isConnected && (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          <WifiOff className="size-6 mx-auto mb-2 opacity-50" />
          Connecting to server…
        </div>
      )}

      {isConnected && members.length === 0 && (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          <Users className="size-6 mx-auto mb-2 opacity-50" />
          Nobody online yet
        </div>
      )}

      {sorted.map(m => {
        const isMe = m.userId === currentUserId;
        return (
          <div
            key={m.userId}
            className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm hover:bg-muted/40 transition-colors"
          >
            <div className="relative shrink-0">
              <Avatar user={{ id: m.userId, name: m.name, avatar: m.avatar }} size={32} />
              <span
                className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-green-500 border-2 border-card pulse-ring"
                aria-label="онлайн"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">
                {m.name}
                {isMe && <span className="text-xs text-muted-foreground ml-1.5">(вы)</span>}
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                {m.role === 'admin' && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3">АДМИН</Badge>
                )}
                <span>online since {formatTime(m.joinedAt)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoomItem(props: { room: Room; active: boolean; onClick: () => void; onDelete?: () => void; }) {
  const { room, active, onClick, onDelete } = props;
  const Icon = room.kind === 'channel' ? Megaphone : MessageSquare;
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
        {room.about && (
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
            if (confirm(`Удалить «${room.name}»? Все сообщения пропадут.`)) onDelete();
          }}
          aria-label="Удалить"
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

function MessageItem(props: { msg: Message; currentUserId: string; showHeader: boolean }) {
  const { msg, currentUserId, showHeader } = props;
  const mine = msg.authorId === currentUserId;
  const safeImage = safeDataUrl(msg.image);

  return (
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
              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-3.5">АДМИН</Badge>
            )}
            <span className="text-muted-foreground">{formatTime(msg.ts)}</span>
          </div>
        )}
        <div
          className={`rounded-2xl px-3 py-2 text-sm break-words
            ${mine ? 'bg-primary text-primary-foreground ' + (showHeader ? 'rounded-tr-sm' : '')
                    : 'bg-card border border-border ' + (showHeader ? 'rounded-tl-sm' : '')}`}
        >
          {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
          {safeImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={safeImage}
              alt="Прикрепление"
              className="rounded-lg max-w-full max-h-80 mt-2"
              loading="lazy"
            />
          )}
        </div>
      </div>
    </div>
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
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="hidden" />
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
  return (
    <ModalShell
      title={room.name}
      description={room.about || ''}
      onClose={props.onClose}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>Close</Button>
          {room.kind === 'channel' && isAdmin && onDelete && (
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4 mr-1" /> Delete channel
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Type</span>
          <Badge variant="outline">{room.kind === 'channel' ? 'Channel' : 'Chat'}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Category</span>
          <span className="font-medium">{categoryLabel(room.category)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Class members</span>
          <span className="font-medium tabular-nums">{members}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Messages</span>
          <span className="font-medium tabular-nums">{room.messages.length}</span>
        </div>
        {room.kind === 'channel' ? (
          <p className="text-xs text-muted-foreground border-t border-border pt-3 mt-2">
            В channelе можно читать. Удалять может только админ.
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
