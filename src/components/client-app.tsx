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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  Send, Plus, Pin, BarChart3, EyeOff, Trash2, Info, User,
  Menu, LogOut, ImagePlus, Hash, MessageSquare,
} from 'lucide-react';

// ============================================================================
// Типы
// ============================================================================

type Role = 'member' | 'admin';
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

interface Channel {
  id: string;
  name: string;
  icon: string;
  about: string;
  posts: Message[];
}

interface Chat {
  id: string;
  name: string;
  icon: string;
  messages: Message[];
}

interface PollOption { t: string; votes: string[]; }
interface Poll {
  id: string;
  room: string;
  q: string;
  options: PollOption[];
  ts: number;
}

interface AnonQuestion {
  id: string;
  room: string;
  q: string;
  answers: { text: string; ts: number }[];
  answered: boolean;
  authorId: string;
}

interface Pinned { room: string; text: string; }

interface AppState {
  user: User | null;
  channels: Channel[];
  chats: Chat[];
  active: string;
  anon: boolean;
  pinned: Pinned | null;
  polls: Poll[];
  anonQs: AnonQuestion[];
}

// ============================================================================
// Константы
// ============================================================================

const STORAGE_KEY = 'klasschat_v1';
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_DIM = 160;
const MAX_MSG_LEN = 2000;
const MAX_NAME_LEN = 32;
const MAX_ABOUT_LEN = 120;
const SAFE_EMOJIS = ['📢','🎉','📚','🏷️','✨','💬','🔥','⭐','🎯','🚀','🎨','⚽','🎵','🍿','💡','🏆','📌','❤️','🛠️','🧪'];

const DEFAULT_CHANNELS: Channel[] = [
  { id: 'c_ann', name: 'объявления', icon: '📢', about: 'Замены, дедлайны, важное', posts: [] },
  { id: 'c_life', name: 'жизнь_класса', icon: '🎉', about: 'Фотки, мемы, истории', posts: [] },
  { id: 'c_study', name: 'учеба', icon: '📚', about: 'Домашки, конспекты, шпоры', posts: [] },
  { id: 'c_shop', name: 'барахолка', icon: '🏷️', about: 'Продать / купить / отдать', posts: [] },
];

const DEFAULT_CHAT: Chat = { id: 'g_main', name: 'Общий чат', icon: '💬', messages: [] };
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

function uid(prefix = 'm'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeIcon(input: string): string {
  const trimmed = (input || '').trim();
  return SAFE_EMOJIS.includes(trimmed) ? trimmed : '✨';
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
// Загрузка/сохранение
// ============================================================================

function loadState(): AppState {
  const base: AppState = {
    user: null,
    channels: DEFAULT_CHANNELS,
    chats: [DEFAULT_CHAT],
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
      channels: Array.isArray(p.channels) && p.channels.length ? p.channels : DEFAULT_CHANNELS,
      chats: Array.isArray(p.chats) && p.chats.length ? p.chats : [DEFAULT_CHAT],
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
    toast.error('Не удалось сохранить — возможно, переполнен localStorage');
  }
}

// ============================================================================
// Главный компонент
// ============================================================================

export default function ClientApp() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [showJoin, setShowJoin] = useState(!state.user);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [pendingImage, setPendingImage] = useState<string | undefined>();
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setState(prev => ({ ...prev }));
    setShowJoin(!state.user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.channels, state.chats, state.active]);

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
        toast.error(data.error || 'Ошибка входа');
        return false;
      }
      const user: User = {
        id: uid('u'),
        name: data.user.name,
        role: data.user.role,
      };
      setState(prev => ({ ...prev, user }));
      setShowJoin(false);
      toast.success(`Добро пожаловать, ${user.name}!`);
      return true;
    } catch {
      toast.error('Сеть недоступна');
      return false;
    }
  };

  const handleLogout = () => {
    setState(prev => ({ ...prev, user: null }));
    setShowJoin(true);
    toast('Ты вышел из аккаунта');
  };

  // ===========================================================================
  // Действия
  // ===========================================================================

  const activeRoom = useMemo(() => {
    const ch = state.channels.find(c => c.id === state.active);
    if (ch) return { type: 'channel' as const, ...ch };
    const ct = state.chats.find(c => c.id === state.active);
    if (ct) return { type: 'chat' as const, ...ct };
    return null;
  }, [state.active, state.channels, state.chats]);

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
    setState(prev => {
      if (activeRoom.type === 'chat') {
        return {
          ...prev,
          chats: prev.chats.map(c =>
            c.id === activeRoom.id ? { ...c, messages: [...c.messages, msg] } : c,
          ),
          anon: false,
        };
      }
      return {
        ...prev,
        channels: prev.channels.map(c =>
          c.id === activeRoom.id ? { ...c, posts: [...c.posts, msg] } : c,
        ),
        anon: false,
      };
    });
    setInputValue('');
    setPendingImage(undefined);
  };

  const toggleAnon = () => setState(prev => ({ ...prev, anon: !prev.anon }));

  const deleteChannel = (id: string) => {
    setState(prev => ({
      ...prev,
      channels: prev.channels.filter(c => c.id !== id),
      active: prev.active === id ? 'g_main' : prev.active,
    }));
    toast('Канал удалён');
  };

  const createChannel = (name: string, about: string, icon: string) => {
    const cleanName = sanitizeText(name, 32).toLowerCase().replace(/\s+/g, '_');
    if (!cleanName) {
      toast.error('Введи название');
      return;
    }
    const newCh: Channel = {
      id: uid('c'),
      name: cleanName,
      icon: safeIcon(icon),
      about: sanitizeText(about, MAX_ABOUT_LEN),
      posts: [],
    };
    setState(prev => ({ ...prev, channels: [...prev.channels, newCh] }));
    toast.success(`Канал «${cleanName}» создан`);
  };

  const pinMessage = (text: string) => {
    if (!activeRoom) return;
    const clean = sanitizeText(text, 500);
    if (!clean) {
      toast.error('Введи текст');
      return;
    }
    setState(prev => ({ ...prev, pinned: { room: activeRoom.id, text: clean } }));
    toast('Сообщение закреплено');
  };

  const unpin = () => {
    setState(prev => ({ ...prev, pinned: null }));
    toast('Закреп удалён');
  };

  const createPoll = (q: string, optionsText: string) => {
    if (!activeRoom || !state.user) return;
    const cleanQ = sanitizeText(q, 200);
    const opts = optionsText
      .split('\n')
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
    };
    setState(prev => ({ ...prev, polls: [...prev.polls, poll] }));
    toast.success('Опрос опубликован');
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
  };

  const askAnon = (q: string) => {
    if (!activeRoom || !state.user) return;
    const cleanQ = sanitizeText(q, 300);
    if (!cleanQ) {
      toast.error('Введи вопрос');
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
    toast.success('Анонимный вопрос отправлен');
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
    toast.success('Ответ отправлен анонимно');
  };

  const updateProfile = (name: string, role: Role, avatar?: string) => {
    if (!state.user) return;
    const cleanName = sanitizeText(name, MAX_NAME_LEN);
    if (!cleanName) {
      toast.error('Имя не может быть пустым');
      return;
    }
    setState(prev => ({
      ...prev,
      user: prev.user
        ? { ...prev.user, name: cleanName, role, avatar: safeDataUrl(avatar, 100_000) }
        : prev.user,
    }));
    toast.success('Профиль обновлён');
  };

  const handleAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('Только JPG, PNG или WebP');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error('Файл больше 2 МБ');
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
          toast.error('Изображение слишком большое даже после сжатия');
          return;
        }
        setPendingImage(dataUrl);
        toast('Изображение прикреплено');
      };
      img.onerror = () => toast.error('Не удалось прочитать изображение');
      img.src = reader.result as string;
    };
    reader.onerror = () => toast.error('Не удалось прочитать файл');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ===========================================================================
  // Render
  // ===========================================================================

  if (showJoin || !state.user) {
    return <JoinScreen onJoin={handleJoin} />;
  }

  const isAdmin = state.user.role === 'admin';
  const pinned = state.pinned && activeRoom && state.pinned.room === activeRoom.id ? state.pinned : null;
  const items = activeRoom
    ? activeRoom.type === 'chat'
      ? activeRoom.messages
      : activeRoom.posts
    : [];
  const roomPolls = state.polls.filter(p => activeRoom && p.room === activeRoom.id);
  const roomAnonQs = state.anonQs.filter(q => !q.answered && activeRoom && q.room === activeRoom.id);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-[100dvh] flex overflow-hidden">
        <Sidebar
          state={state}
          onSelect={(id) => {
            setState(prev => ({ ...prev, active: id }));
            setSidebarOpen(false);
          }}
          onAddChannel={() => setModalMode('addChannel')}
          onDeleteChannel={isAdmin ? deleteChannel : undefined}
          isAdmin={isAdmin}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          user={state.user}
          onLogout={handleLogout}
          onProfile={() => setModalMode('profile')}
        />

        <main className="flex-1 flex flex-col min-w-0">
          <header className="glass border-b border-border flex items-center gap-2 px-3 sm:px-4 h-14 shrink-0">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Меню">
              <Menu className="size-5" />
            </Button>
            {activeRoom && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{activeRoom.icon}</span>
                  <span className="font-semibold truncate">{activeRoom.name}</span>
                  {activeRoom.type === 'channel' && <Badge variant="secondary" className="text-xs">канал</Badge>}
                </div>
                {activeRoom.about && (
                  <div className="text-xs text-muted-foreground truncate">{activeRoom.about}</div>
                )}
              </div>
            )}
            <div className="flex items-center gap-0.5">
              {pinned && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={unpin} aria-label="Открепить">
                      <Pin className="size-4 text-primary" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Открепить</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setModalMode('pin')} aria-label="Закрепить">
                    <Pin className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Закрепить сообщение</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setModalMode('poll')} aria-label="Опрос">
                    <BarChart3 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Создать опрос</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setModalMode('anon')} aria-label="Анонимный вопрос">
                    <EyeOff className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Анонимный вопрос</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setModalMode('info')} aria-label="Информация">
                    <Info className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Информация</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setModalMode('profile')} aria-label="Профиль">
                    <User className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Профиль</TooltipContent>
              </Tooltip>
            </div>
          </header>

          {pinned && (
            <div className="glass border-b border-border px-3 sm:px-4 py-2 flex items-start gap-2 text-sm">
              <Pin className="size-4 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-muted-foreground">Закреплено: </span>
                <span className="break-words">{pinned.text}</span>
              </div>
              <Button variant="ghost" size="icon" className="size-6" onClick={unpin} aria-label="Открепить">
                <Trash2 className="size-3" />
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto scroll-thin px-3 sm:px-4 py-4">
            <div className="max-w-3xl mx-auto flex flex-col gap-3">
              {items.length === 0 && roomPolls.length === 0 && roomAnonQs.length === 0 && (
                <div className="text-center text-muted-foreground py-20">
                  <div className="text-5xl mb-3">{activeRoom?.type === 'chat' ? '💬' : '📢'}</div>
                  <p className="text-sm">Здесь пока пусто.<br />Напиши первым — или закрепи сообщение сверху.</p>
                </div>
              )}

              {items.map(it => (
                <MessageItem key={it.id} msg={it} currentUserId={state.user!.id} />
              ))}

              {activeRoom?.type === 'chat' && roomPolls.map(p => (
                <PollCard key={p.id} poll={p} currentUserId={state.user!.id} onVote={votePoll} />
              ))}

              {activeRoom?.type === 'chat' && roomAnonQs.map(q => (
                <AnonCard key={q.id} q={q} onAnswer={answerAnon} />
              ))}

              <div ref={messagesEndRef} />
            </div>
          </div>

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
                    aria-label="Убрать изображение"
                  >
                    <Trash2 className="size-3" />
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
                  aria-label="Прикрепить изображение"
                >
                  <ImagePlus className="size-5" />
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={state.anon ? 'secondary' : 'ghost'}
                      size="icon"
                      className={`shrink-0 ${state.anon ? 'text-primary' : ''}`}
                      onClick={toggleAnon}
                      aria-label="Анонимно"
                    >
                      <EyeOff className="size-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{state.anon ? 'Анонимный режим включён' : 'Отправить анонимно'}</TooltipContent>
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
                  placeholder="Написать сообщение…"
                  rows={1}
                  className="resize-none min-h-[42px] max-h-32 flex-1"
                  maxLength={MAX_MSG_LEN}
                />
                <Button
                  size="icon"
                  className="shrink-0"
                  onClick={sendMessage}
                  disabled={!inputValue.trim() && !pendingImage}
                  aria-label="Отправить"
                >
                  <Send className="size-5" />
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {modalMode === 'addChannel' && (
        <AddChannelModal onClose={() => setModalMode(null)} onCreate={createChannel} />
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
          onDelete={isAdmin ? () => { deleteChannel(activeRoom.id); setModalMode(null); } : undefined}
        />
      )}
    </TooltipProvider>
  );
}

// ============================================================================
// Sidebar
// ============================================================================

function Sidebar(props: {
  state: AppState;
  active: string;
  onSelect: (id: string) => void;
  onAddChannel: () => void;
  onDeleteChannel?: (id: string) => void;
  isAdmin: boolean;
  open: boolean;
  onClose: () => void;
  user: User;
  onLogout: () => void;
  onProfile: () => void;
}) {
  const { state, active, onSelect, onAddChannel, onDeleteChannel, isAdmin, open, onClose, user, onLogout, onProfile } = props;

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
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div
            className="size-10 rounded-xl flex items-center justify-center font-extrabold text-lg shrink-0"
            style={{ background: 'linear-gradient(135deg, #f5a623, #e94e6a)', color: '#0a0e1a' }}
          >
            К
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold leading-tight truncate">КлассChat</div>
            <div className="text-xs text-muted-foreground truncate">{user.name} · {state.channels.length + state.chats.length} комнат</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scroll-thin p-2">
          <div className="flex items-center justify-between px-2 py-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Каналы</span>
            <Button variant="ghost" size="icon" className="size-6" onClick={onAddChannel} aria-label="Создать канал">
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="flex flex-col gap-0.5 mb-3">
            {state.channels.map(c => (
              <RoomItem
                key={c.id}
                icon={c.icon}
                name={c.name}
                count={c.posts.length}
                active={c.id === active}
                onClick={() => onSelect(c.id)}
                onDelete={isAdmin && onDeleteChannel ? () => onDeleteChannel(c.id) : undefined}
              />
            ))}
          </div>

          <div className="flex items-center justify-between px-2 py-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Чаты</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {state.chats.map(c => (
              <RoomItem
                key={c.id}
                icon={c.icon}
                name={c.name}
                count={c.messages.length}
                active={c.id === active}
                onClick={() => onSelect(c.id)}
              />
            ))}
          </div>
        </div>

        <div className="p-3 border-t border-border flex items-center gap-2">
          <button onClick={onProfile} className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80" aria-label="Профиль">
            <Avatar user={user} size={36} />
            <div className="min-w-0 text-left">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-xs text-muted-foreground">
                {user.role === 'admin' ? '👑 Админ' : 'Ученик'}
              </div>
            </div>
          </button>
          <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Выйти">
            <LogOut className="size-4" />
          </Button>
        </div>
      </aside>
    </>
  );
}

function RoomItem(props: {
  icon: string;
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const { icon, name, count, active, onClick, onDelete } = props;
  return (
    <div
      className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer text-sm transition-colors
        ${active ? 'bg-primary/15 text-foreground' : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <span className="text-base shrink-0">{icon}</span>
      <span className="flex-1 truncate">{name}</span>
      {count > 0 && (
        <span className="text-xs text-muted-foreground shrink-0">{count}</span>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="size-6 opacity-0 group-hover:opacity-100 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Удалить канал «${name}»? Все сообщения пропадут.`)) onDelete();
          }}
          aria-label="Удалить канал"
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

function MessageItem(props: { msg: Message; currentUserId: string }) {
  const { msg, currentUserId } = props;
  const mine = msg.authorId === currentUserId;
  const safeImage = safeDataUrl(msg.image);

  return (
    <div className={`flex gap-3 msg-in ${mine ? 'flex-row-reverse' : ''}`}>
      <div
        className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
        style={{
          width: 36, height: 36,
          background: msg.anon ? '#6e40c9' : avColor(msg.authorId),
          fontSize: 14,
        }}
      >
        {msg.anon ? '?' : initials(msg.authorName)}
      </div>
      <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span className={msg.anon ? 'text-purple-400 font-medium' : 'text-primary font-medium'}>
            {msg.anon ? 'Анонимно' : msg.authorName}
          </span>
          {!msg.anon && msg.role === 'admin' && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">админ</Badge>
          )}
          <span>{formatTime(msg.ts)}</span>
        </div>
        <div
          className={`rounded-2xl px-3 py-2 text-sm break-words
            ${mine ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-card border border-border rounded-tl-sm'}`}
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

function PollCard(props: { poll: Poll; currentUserId: string; onVote: (pollId: string, optIdx: number) => void }) {
  const { poll, currentUserId, onVote } = props;
  const voted = poll.options.some(o => o.votes.includes(currentUserId));
  const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0);

  return (
    <Card className="p-4 msg-in">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="size-4 text-primary" />
        <span className="font-medium text-sm">{poll.q}</span>
      </div>
      <div className="flex flex-col gap-2">
        {poll.options.map((o, i) => {
          const c = o.votes.length;
          const pct = totalVotes > 0 ? Math.round((c / totalVotes) * 100) : 0;
          if (voted) {
            return (
              <div key={i} className="relative bg-muted/40 rounded-lg overflow-hidden p-2">
                <div
                  className="absolute inset-y-0 left-0 bg-primary/20"
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex justify-between text-sm">
                  <span>{o.t}</span>
                  <span className="text-muted-foreground">{c} · {pct}%</span>
                </div>
              </div>
            );
          }
          return (
            <button
              key={i}
              className="text-left text-sm border border-border rounded-lg px-3 py-2 hover:border-primary hover:bg-muted/40 transition-colors flex justify-between"
              onClick={() => onVote(poll.id, i)}
            >
              <span>{o.t}</span>
              <span className="text-muted-foreground">{c}</span>
            </button>
          );
        })}
      </div>
      <div className="text-xs text-muted-foreground mt-2">
        {totalVotes} голосов · {formatTime(poll.ts)}
      </div>
    </Card>
  );
}

function AnonCard(props: { q: AnonQuestion; onAnswer: (id: string, text: string) => void }) {
  const { q, onAnswer } = props;
  const [text, setText] = useState('');
  return (
    <Card className="p-4 msg-in">
      <div className="flex items-center gap-2 mb-2">
        <EyeOff className="size-4 text-purple-400" />
        <span className="font-medium text-sm">{q.q}</span>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Твой ответ (анонимно)…"
        rows={2}
        maxLength={500}
        className="resize-none mb-2"
      />
      <Button
        size="sm"
        onClick={() => {
          onAnswer(q.id, text);
          setText('');
        }}
        disabled={!text.trim()}
      >
        <Send className="size-3 mr-1" /> Ответить анонимно
      </Button>
    </Card>
  );
}

function JoinScreen(props: { onJoin: (code: string, name: string) => Promise<boolean> }) {
  const { onJoin } = props;
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    setLoading(true);
    await onJoin(code, name);
    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 glass">
        <div className="flex items-center gap-3 mb-5">
          <div
            className="size-12 rounded-xl flex items-center justify-center font-extrabold text-xl shrink-0"
            style={{ background: 'linear-gradient(135deg, #f5a623, #e94e6a)', color: '#0a0e1a' }}
          >
            К
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">КлассChat</h1>
            <p className="text-xs text-muted-foreground">Закрытая соцсеть твоего класса</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="jc">Код класса</Label>
            <Input
              id="jc"
              inputMode="numeric"
              placeholder="6 цифр"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div>
            <Label htmlFor="jn">Твоё имя</Label>
            <Input
              id="jn"
              placeholder="Как тебя показывать классу"
              maxLength={MAX_NAME_LEN}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <Button className="w-full" onClick={submit} disabled={loading || !code || !name.trim()}>
            {loading ? 'Проверка…' : 'Войти в класс'}
          </Button>
        </div>

        <div className="mt-5 p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground leading-relaxed">
          🔒 Коды проверки находятся на сервере и не видны в браузере.
          Авторизация идёт через API с защитой от перебора (10 попыток в минуту).
        </div>
      </Card>
    </div>
  );
}

function ModalShell(props: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="glass">
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

function AddChannelModal(props: { onClose: () => void; onCreate: (name: string, about: string, icon: string) => void }) {
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [icon, setIcon] = useState('✨');

  return (
    <ModalShell
      title="Новый канал"
      description="Канал — односторонняя лента: пишет автор, читают все."
      onClose={props.onClose}
      footer={
        <Button onClick={() => { props.onCreate(name, about, icon); props.onClose(); }}>
          Создать
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="cn">Название</Label>
          <Input id="cn" placeholder="например: спорт" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cd">Описание</Label>
          <Input id="cd" placeholder="о чём канал" maxLength={MAX_ABOUT_LEN} value={about} onChange={(e) => setAbout(e.target.value)} />
        </div>
        <div>
          <Label>Иконка</Label>
          <div className="flex flex-wrap gap-1.5">
            {SAFE_EMOJIS.map(e => (
              <button
                key={e}
                className={`text-xl p-1.5 rounded-lg border transition-colors
                  ${icon === e ? 'border-primary bg-primary/15' : 'border-border hover:bg-muted/60'}`}
                onClick={() => setIcon(e)}
                aria-label={`Иконка ${e}`}
              >
                {e}
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
      title="Закрепить сообщение"
      description={`Закреп появится вверху комнаты «${props.roomName}».`}
      onClose={props.onClose}
      footer={
        <Button onClick={() => { props.onPin(text); props.onClose(); }} disabled={!text.trim()}>
          Закрепить
        </Button>
      }
    >
      <div>
        <Label htmlFor="pt">Текст</Label>
        <Textarea id="pt" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Что закрепить?" />
      </div>
    </ModalShell>
  );
}

function PollModal(props: { onClose: () => void; onCreate: (q: string, opts: string) => void }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState('');
  return (
    <ModalShell
      title="Новый опрос"
      description="Вопрос и варианты. Класс увидит его в чате."
      onClose={props.onClose}
      footer={
        <Button onClick={() => { props.onCreate(q, opts); props.onClose(); }}>
          Опубликовать
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="pq">Вопрос</Label>
          <Input id="pq" placeholder="Когда сдаём проект?" maxLength={200} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="po">Варианты (каждый с новой строки)</Label>
          <Textarea id="po" rows={4} placeholder={'В понедельник\nВ среду'} maxLength={800} value={opts} onChange={(e) => setOpts(e.target.value)} />
        </div>
      </div>
    </ModalShell>
  );
}

function AnonModal(props: { onClose: () => void; onAsk: (q: string) => void }) {
  const [q, setQ] = useState('');
  return (
    <ModalShell
      title="Анонимный вопрос"
      description="Класс ответит, не зная автора."
      onClose={props.onClose}
      footer={
        <Button onClick={() => { props.onAsk(q); props.onClose(); }} disabled={!q.trim()}>
          Задать анонимно
        </Button>
      }
    >
      <div>
        <Label htmlFor="aq">Вопрос</Label>
        <Textarea id="aq" rows={3} maxLength={300} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Что спросить у класса?" />
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
      toast.error('Только JPG, PNG или WebP');
      return;
    }
    if (f.size > AVATAR_MAX_BYTES) {
      toast.error('Файл больше 2 МБ');
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
          toast.error('Слишком большое изображение');
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
      title="Профиль"
      description="Так тебя видят в классе."
      onClose={props.onClose}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>Отмена</Button>
          <Button onClick={() => { props.onSave(name, role, avatar); props.onClose(); }}>Сохранить</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar user={{ id: props.user.id, name, avatar }} size={64} />
          <div className="flex-1">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4 mr-1" /> Загрузить
            </Button>
            {avatar && (
              <Button variant="ghost" size="sm" className="ml-2" onClick={() => setAvatar(undefined)}>
                Убрать
              </Button>
            )}
            <p className="text-xs text-muted-foreground mt-1">JPG/PNG/WebP, до 2 МБ, обрежется в круг.</p>
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
          <Label htmlFor="pr" className="cursor-pointer">Я админ класса</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          ⚠️ Реальные права админа выдаёт только сервер при вводе админского кода.
          Эта галочка — лишь для локального предпросмотра.
        </p>
      </div>
    </ModalShell>
  );
}

function InfoModal(props: {
  onClose: () => void;
  room: { id: string; name: string; icon: string; about?: string; type: 'channel' | 'chat' };
  members: number;
  isAdmin: boolean;
  onDelete?: () => void;
}) {
  const { room, members, isAdmin, onDelete } = props;
  return (
    <ModalShell
      title={`${room.icon} ${room.name}`}
      description={room.about || ''}
      onClose={props.onClose}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>Закрыть</Button>
          {room.type === 'channel' && isAdmin && onDelete && (
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4 mr-1" /> Удалить канал
            </Button>
          )}
        </>
      }
    >
      <div className="text-sm text-muted-foreground space-y-2">
        <p>Участников класса: <span className="text-foreground font-medium">{members}</span></p>
        {room.type === 'channel' ? (
          <p className="flex items-start gap-2">
            <Hash className="size-4 shrink-0 mt-0.5" />
            <span>В канале можно читать. Удалять может только админ.</span>
          </p>
        ) : (
          <p className="flex items-start gap-2">
            <MessageSquare className="size-4 shrink-0 mt-0.5" />
            <span>В чате пишут все. Поддерживаются опросы и анонимные вопросы.</span>
          </p>
        )}
      </div>
    </ModalShell>
  );
}
