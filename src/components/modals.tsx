'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { DbProfile, DbRoom } from '@/lib/api';
import { avColor, initials, roomColor, MAX_ABOUT_LEN, type Room, type RoomKind } from '@/lib/chat-types';
import {
  AtSign, Crown, Forward, Megaphone, MessageCircle, MessageSquare, Plus, Search,
  Shield, Users, User as UserIcon, Wrench, X,
} from 'lucide-react';

// ============================================================================
// ModalShell
// ============================================================================

export function ModalShell(props: {
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
          <DialogTitle className="word-safe">{props.title}</DialogTitle>
          {props.description && <DialogDescription className="word-safe">{props.description}</DialogDescription>}
        </DialogHeader>
        {props.children}
        {props.footer && <DialogFooter>{props.footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// AddRoomModal — create channel (legacy "chats" section was removed on request;
// the modal now creates channels only)
// ============================================================================

export function AddRoomModal(props: {
  onClose: () => void;
  onCreate: (name: string, about: string, category: string, kind: RoomKind) => void;
  t: (key: string) => string;
}) {
  const { t } = props;
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [category, setCategory] = useState<string>('general');

  const CATEGORIES = [
    { id: 'general' }, { id: 'announcements' }, { id: 'study' }, { id: 'life' },
    { id: 'shop' }, { id: 'sport' }, { id: 'creative' }, { id: 'other' },
  ] as const;

  return (
    <ModalShell
      title={t('newRoom.title')}
      description={t('newRoom.channelDesc')}
      onClose={props.onClose}
      footer={
        <Button onClick={() => { props.onCreate(name, about, category, 'channel'); props.onClose(); }}>
          {t('newRoom.create')}
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="cn">{t('newRoom.name')}</Label>
          <Input id="cn" placeholder={t('newRoom.namePlaceholder')} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cd">{t('newRoom.description')}</Label>
          <Input id="cd" placeholder={t('newRoom.aboutHint')} maxLength={MAX_ABOUT_LEN} value={about} onChange={(e) => setAbout(e.target.value)} />
        </div>
        <div>
          <Label>{t('newRoom.category')}</Label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                type="button"
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors
                  ${category === c.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
                onClick={() => setCategory(c.id)}
              >
                {t(`cat.${c.id}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// PollModal
// ============================================================================

export function PollModal(props: { onClose: () => void; onCreate: (q: string, opts: string[]) => void; t: (key: string) => string }) {
  const { t } = props;
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
      title={t('poll.new')}
      description={t('poll.questionAndOptions')}
      onClose={props.onClose}
      footer={
        <Button onClick={handlePublish} disabled={!canPublish}>
          {t('poll.publish')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="pq">{t('poll.question')}</Label>
          <Input
            id="pq"
            placeholder={t('poll.question')}
            maxLength={200}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>{t('poll.options')}</Label>
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
                  placeholder={`${t('poll.option')} ${i + 1}`}
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
                  aria-label={t('delete')}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            <Button variant="outline" size="sm" onClick={addOpt} disabled={opts.length >= MAX_OPTS}>
              <Plus className="size-4 mr-1" /> {t('poll.addOption')}
            </Button>
            <p className="text-xs text-muted-foreground">{t('poll.minMax')} {MAX_OPTS}.</p>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// AnonModal
// ============================================================================

export function AnonModal(props: { onClose: () => void; onAsk: (q: string) => void; t: (key: string) => string }) {
  const { t } = props;
  const [q, setQ] = useState('');
  return (
    <ModalShell
      title={t('anon.title')}
      description={t('anon.questionAndOptions')}
      onClose={props.onClose}
      footer={
        <Button onClick={() => { props.onAsk(q); props.onClose(); }} disabled={!q.trim()}>
          {t('anon.askAnon')}
        </Button>
      }
    >
      <div>
        <Label htmlFor="aq">{t('anon.question')}</Label>
        <Textarea id="aq" rows={3} maxLength={300} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('anon.whatToAsk')} />
      </div>
    </ModalShell>
  );
}

// ============================================================================
// CreateGroupModal — name + member multiselect
// ============================================================================

export function CreateGroupModal(props: {
  onClose: () => void;
  onCreate: (name: string, memberIds: string[]) => void;
  profiles: DbProfile[];
  currentUserId: string;
  t: (key: string) => string;
}) {
  const { profiles, currentUserId, onCreate, onClose, t } = props;
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const others = profiles.filter(p => p.id !== currentUserId);
  const filtered = others.filter(p =>
    !query
    || p.name.toLowerCase().includes(query.toLowerCase())
    || (p.username ?? '').toLowerCase().includes(query.toLowerCase())
    || (p.email ?? '').toLowerCase().includes(query.toLowerCase()),
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
      title={t('nav.createGroup')}
      description={t('newRoom.groupDesc')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button
            onClick={() => onCreate(name, Array.from(selected))}
            disabled={!name.trim() || selected.size === 0}
          >
            {t('newRoom.create')} ({selected.size})
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="gn">{t('newRoom.name')}</Label>
          <Input
            id="gn"
            placeholder={t('newRoom.namePlaceholder')}
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="gq">{t('newRoom.selectMembers')}</Label>
          <Input
            id="gq"
            placeholder={t('nav.searchUsers')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="max-h-60 overflow-y-auto scroll-thin border border-border rounded-xl divide-y divide-border">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {t('group.noUsers')}
            </div>
          )}
          {filtered.map(p => {
            const checked = selected.has(p.id);
            return (
              <label
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(p.id)} />
                <Avatar user={{ id: p.id, name: p.name, avatar: p.avatar ?? undefined }} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">@{p.username || p.email?.split('@')[0]}</div>
                </div>
              </label>
            );
          })}
        </div>
        {selected.size > 0 && (
          <div className="text-xs text-muted-foreground">
            {t('newRoom.selectMembers')}: {selected.size}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ============================================================================
// NewDmModal — pick a person and start a private chat
// ============================================================================

export function NewDmModal(props: {
  onClose: () => void;
  onStart: (userId: string) => void;
  profiles: DbProfile[];
  currentUserId: string;
  t: (key: string) => string;
}) {
  const { profiles, currentUserId, onStart, onClose, t } = props;
  const [query, setQuery] = useState('');
  const others = profiles
    .filter(p => p.id !== currentUserId)
    .filter(p => !query
      || p.name.toLowerCase().includes(query.toLowerCase())
      || (p.username ?? '').toLowerCase().includes(query.toLowerCase())
      || (p.email ?? '').toLowerCase().includes(query.toLowerCase()));

  return (
    <ModalShell
      title={t('newDm.title')}
      description={t('newDm.desc')}
      onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>}
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('nav.searchUsers')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto scroll-thin border border-border rounded-xl divide-y divide-border">
          {others.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t('newDm.none')}
            </div>
          )}
          {others.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onStart(p.id); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors text-left"
            >
              <Avatar user={{ id: p.id, name: p.name, avatar: p.avatar ?? undefined }} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground truncate">@{p.username || p.email?.split('@')[0]}</div>
              </div>
              <MessageSquare className="size-4 text-muted-foreground shrink-0 opacity-60" />
            </button>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// ForwardModal — pick a destination room
// ============================================================================

export function ForwardModal(props: {
  onClose: () => void;
  onForward: (roomId: string) => void;
  rooms: Room[];
  currentRoomId?: string;
  t: (key: string) => string;
}) {
  const { onForward, onClose, rooms, currentRoomId, t } = props;
  const [query, setQuery] = useState('');
  const filtered = rooms.filter(r =>
    r.id !== currentRoomId &&
    (!query || r.name.toLowerCase().includes(query.toLowerCase())),
  );

  const typeLabel = (r: Room) =>
    r.roomType === 'dm' ? t('room.dm')
      : r.roomType === 'group' ? t('room.group')
      : r.kind === 'channel' ? t('room.channel')
      : t('room.chat');

  const typeIcon = (r: Room) =>
    r.roomType === 'dm' ? <UserIcon className="size-3.5" />
      : r.roomType === 'group' ? <Users className="size-3.5" />
      : r.kind === 'channel' ? <Megaphone className="size-3.5" />
      : <MessageSquare className="size-3.5" />;

  return (
    <ModalShell
      title={t('forward.title')}
      description={t('forward.desc')}
      onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>}
    >
      <div className="space-y-3">
        <Input
          placeholder={t('nav.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-80 overflow-y-auto scroll-thin border border-border rounded-xl divide-y divide-border">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {t('forward.none')}
            </div>
          )}
          {filtered.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => onForward(r.id)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="room-avatar size-8" style={{ background: roomColor(r) }}>
                {typeIcon(r)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground">{typeLabel(r)}</div>
              </div>
              <Forward className="size-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// UserProfileModal — view another user's profile (or your own)
//   Entry points: sidebar people search, message author click
// ============================================================================
export function UserProfileModal(props: {
  profile: DbProfile;
  isOwn: boolean;
  dateLocale: string;
  onClose: () => void;
  onStartDm?: (userId: string) => void;
  onEditProfile?: () => void;
  t: (key: string) => string;
}) {
  const { profile, isOwn, dateLocale, onClose, onStartDm, onEditProfile, t } = props;
  const username = profile.username || profile.email?.split('@')[0] || 'user';

  const joined = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <ModalShell title={t('profile.view')} onClose={onClose}>
      <div className="space-y-4">
        {/* Header: avatar + name + @username */}
        <div className="flex flex-col items-center text-center pt-1">
          {profile.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar}
              alt={profile.name}
              className="size-20 rounded-full object-cover ring-2 ring-background shadow-md"
            />
          ) : (
            <div
              className="size-20 rounded-full flex items-center justify-center font-bold text-white text-2xl shadow-md"
              style={{ background: avColor(profile.id) }}
            >
              {initials(profile.name)}
            </div>
          )}
          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap justify-center">
            <h2 className="text-lg font-semibold word-safe">{profile.name}</h2>
            {profile.role === 'dev' && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 gap-0.5 border-cyan-500/40 bg-cyan-500/10 text-cyan-600">
                <Wrench className="size-2.5" /> {t('nav.devRole')}
              </Badge>
            )}
            {profile.role === 'admin' && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 gap-0.5">
                <Shield className="size-2.5" /> {t('nav.adminRights')}
              </Badge>
            )}
            {isOwn && (
              <span className="text-[10px] text-muted-foreground font-normal">· {t('profile.isYou')}</span>
            )}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
            <AtSign className="size-3.5" />
            <span className="word-safe">{username}</span>
          </div>
          {profile.about && (
            <p className="mt-2 text-sm text-foreground/90 max-w-[20rem] mx-auto whitespace-pre-wrap break-words word-safe">
              {profile.about}
            </p>
          )}
        </div>

        {/* Details */}
        <div className="rounded-xl border border-border bg-muted/30 divide-y divide-border">
          {joined && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground shrink-0">{t('profile.joined')}</span>
              <span className="font-medium text-right">{joined}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {!isOwn && onStartDm && (
            <Button className="w-full" onClick={() => { onStartDm(profile.id); onClose(); }}>
              <MessageCircle className="size-4 mr-1.5" /> {t('profile.message')}
            </Button>
          )}
          {isOwn && onEditProfile && (
            <Button className="w-full" onClick={() => { onEditProfile(); onClose(); }}>
              <UserIcon className="size-4 mr-1.5" /> {t('profile.editProfile')}
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={onClose}>
            {t('profile.close')}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// BrowseChannelsModal — join an existing channel (opt-in room discovery)
// ============================================================================
export function BrowseChannelsModal(props: {
  onClose: () => void;
  channels: DbRoom[];
  onJoin: (roomId: string) => void;
  t: (key: string) => string;
}) {
  const { onClose, channels, onJoin, t } = props;
  return (
    <ModalShell title={t('nav.browseChannels')} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('nav.browseChannelsHint')}</p>
        <div className="max-h-80 overflow-y-auto scroll-thin border border-border rounded-xl divide-y divide-border">
          {channels.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t('nav.noChannelsToJoin')}
            </div>
          )}
          {channels.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => { onJoin(r.id); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="room-avatar size-9 shrink-0" style={{ background: roomColor({ id: r.id, name: r.name, kind: r.kind, roomType: 'channel', messages: [], category: r.category ?? 'general' } as Room) }}>
                <Megaphone className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate word-safe">{r.name}</div>
                {r.about && <div className="text-xs text-muted-foreground truncate word-safe">{r.about}</div>}
              </div>
              <Plus className="size-4 text-primary shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}
