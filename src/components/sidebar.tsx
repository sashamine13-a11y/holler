'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/avatar';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import type { DbProfile } from '@/lib/api';
import type { RoomPreview } from '@/lib/api';
import type { OnlineMember } from '@/hooks/use-socket';
import { roomColor, formatListTime, type Room, type User } from '@/lib/chat-types';
import {
  BellOff, ChevronDown, LogOut, Megaphone, MessageSquare, Menu as MenuIcon,
  Pin, Plus, Search, Settings, Users, User as UserIcon, WifiOff,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useLocalSettings } from '@/lib/local-settings';

// ============================================================================
// Sidebar — filter chips (All / Channels / Groups / DMs), collapsible
// sections, people search. Global member list lives inside group settings.
// ============================================================================

type RoomFilter = 'all' | 'channels' | 'groups' | 'dms';

export function Sidebar(props: {
  rooms: Room[];
  active: string;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onSelect: (id: string) => void;
  onAddChannel: () => void;
  onAddGroup: () => void;
  onNewDm: () => void;
  user: User;
  onLogout: () => void;
  onSettings: () => void;
  onlineMembers: OnlineMember[];
  isConnected: boolean;
  onMemberClick: (userId: string) => void;
  profiles: DbProfile[];
  previews: Record<string, RoomPreview>;
  seen: Record<string, number>;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const {
    rooms, active, searchQuery, onSearchChange, onSelect, onAddChannel, onAddGroup,
    onNewDm, user, onLogout, onSettings, onlineMembers, isConnected,
    onMemberClick, profiles, previews, seen, mobileOpen, onClose,
  } = props;
  const { t, dateLocale } = useI18n();
  const { roomPrefs } = useLocalSettings();

  const [filter, setFilter] = useState<RoomFilter>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const onlineIds = new Set(onlineMembers.map(m => m.userId));
  const q = searchQuery.trim().toLowerCase();

  const matchesSearch = (r: Room) => !q || r.name.toLowerCase().includes(q);

  const sortByPinned = (list: Room[]): Room[] => {
    // Pinned-to-top rooms first (stable within group), then original order.
    const pinned: Room[] = [];
    const rest: Room[] = [];
    for (const r of list) {
      if (roomPrefs(r.id)?.pinnedTop) pinned.push(r); else rest.push(r);
    }
    return [...pinned, ...rest];
  };

  const channels = sortByPinned(rooms.filter(r => r.kind === 'channel' && r.roomType === 'channel' && matchesSearch(r)));
  const groups = sortByPinned(rooms.filter(r => r.roomType === 'group' && matchesSearch(r)));
  const dms = sortByPinned(rooms.filter(r => r.roomType === 'dm' && matchesSearch(r)));

  const counts: Record<RoomFilter, number> = {
    all: channels.length + groups.length + dms.length,
    channels: channels.length,
    groups: groups.length,
    dms: dms.length,
  };

  const isUnread = (r: Room) =>
    !q && r.id !== active && !!previews[r.id] && previews[r.id].ts > (seen[r.id] ?? 0);

  // People matches for the search (start a DM straight from results)
  const peopleMatches = q
    ? profiles
        .filter(p => p.id !== user.id && (p.name.toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q)))
        .slice(0, 8)
    : [];

  const toggleSection = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const sections: { id: string; label: string; icon: React.ReactNode; add?: () => void; addLabel?: string; list: Room[] }[] = [
    { id: 'dms', label: t('nav.dms'), icon: <UserIcon className="size-3" />, add: onNewDm, addLabel: t('nav.newMessage'), list: dms },
    { id: 'groups', label: t('nav.groups'), icon: <Users className="size-3" />, add: onAddGroup, addLabel: t('nav.createGroup'), list: groups },
    { id: 'channels', label: t('nav.channels'), icon: <Megaphone className="size-3" />, add: onAddChannel, addLabel: t('nav.createChannel'), list: channels },
  ];

  const emptyByFilter: Record<RoomFilter, string> = {
    all: '', channels: t('room.noChannels'), groups: t('room.noGroups'), dms: t('room.noDMs'),
  };

  const renderRoom = (r: Room) => (
    <RoomItem
      key={r.id}
      room={r}
      active={r.id === active}
      onClick={() => onSelect(r.id)}
      preview={previews[r.id]}
      unread={isUnread(r)}
      profileAvatar={r.roomType === 'dm'
        ? profiles.find(p => p.id === r.dmOtherUserId)?.avatar ?? undefined
        : undefined}
      online={r.roomType === 'dm' && r.dmOtherUserId ? onlineIds.has(r.dmOtherUserId) : false}
      myName={user.name}
      youLabel={t('list.you')}
      dateLocale={dateLocale}
    />
  );

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={onClose} aria-hidden />
      )}
      <aside
        className={`glass border-r border-border flex flex-col w-[300px] shrink-0
          fixed md:static inset-y-0 left-0 z-50 transition-transform
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Brand + connection */}
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          <div className="brand-mark size-10 rounded-2xl flex items-center justify-center font-extrabold text-lg shrink-0">
            H
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[15px] leading-tight tracking-tight truncate">Holler</div>
            {/* Connection status only — the global online counter was removed on purpose */}
            {!isConnected ? (
              <div className="text-[11px] text-destructive truncate flex items-center gap-1.5">
                <WifiOff className="size-3 connection-pulse shrink-0" /> {t('nav.noConnection')}
              </div>
            ) : null}
          </div>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('nav.searchRooms')}
              className="pl-9 h-9 rounded-xl bg-muted/40 border-border/60"
            />
          </div>
        </div>

        {/* Filter chips: All / Channels / Groups / DMs */}
        <div className="px-3 pb-2 grid grid-cols-4 gap-1">
          <FilterChip
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            icon={<MenuIcon className="size-3.5" />}
            label={t('nav.all')}
            count={counts.all}
          />
          <FilterChip
            active={filter === 'channels'}
            onClick={() => setFilter('channels')}
            icon={<Megaphone className="size-3.5" />}
            label={t('nav.channels')}
            count={counts.channels}
          />
          <FilterChip
            active={filter === 'groups'}
            onClick={() => setFilter('groups')}
            icon={<Users className="size-3.5" />}
            label={t('nav.groups')}
            count={counts.groups}
          />
          <FilterChip
            active={filter === 'dms'}
            onClick={() => setFilter('dms')}
            icon={<UserIcon className="size-3.5" />}
            label={t('nav.dms')}
            count={counts.dms}
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scroll-thin px-2 pb-2">
          {filter === 'all' ? (
            sections.map(s => {
              const isCollapsed = collapsed.has(s.id);
              const withUnread = s.list.filter(isUnread).length;
              return (
                <div key={s.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleSection(s.id)}
                    className="w-full flex items-center justify-between px-2 pt-2 pb-1.5 rounded-lg hover:bg-muted/40 transition-colors group"
                  >
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 font-medium min-w-0">
                      {isCollapsed
                        ? <ChevronDown className="size-3 -rotate-90 transition-transform" />
                        : <ChevronDown className="size-3 transition-transform" />}
                      {s.icon}
                      <span className="truncate">{s.label}</span>
                      {withUnread > 0 && (
                        <span className="brand-mark text-[9px] px-1.5 h-3.5 min-w-[14px] rounded-full text-white font-bold flex items-center justify-center">
                          {withUnread}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-0.5">
                      {s.list.length > 0 && (
                        <span className="text-[10px] text-muted-foreground/70 tabular-nums">{s.list.length}</span>
                      )}
                      {s.add && (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={s.addLabel}
                          className="size-5 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          onClick={(e) => { e.stopPropagation(); s.add?.(); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); s.add?.(); } }}
                        >
                          <Plus className="size-3.5" />
                        </span>
                      )}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="flex flex-col gap-0.5">
                      {s.list.length === 0 && (
                        <div className="text-xs text-muted-foreground px-3 py-1.5">{s.id === 'dms' ? t('room.startDM') : emptyByFilter[s.id as RoomFilter] || ''}</div>
                      )}
                      {s.list.map(renderRoom)}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex flex-col gap-0.5 pt-1">
              {counts[filter] === 0 && (
                <div className="text-xs text-muted-foreground px-3 py-2">{emptyByFilter[filter]}</div>
              )}
              {(filter === 'dms' ? dms : filter === 'groups' ? groups : channels).map(renderRoom)}
            </div>
          )}

          {/* People in search results */}
          {q && (
            <div className="mt-3">
              <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 font-medium">
                  <UserIcon className="size-3" /> {t('nav.people')}
                </span>
              </div>
              {peopleMatches.length === 0 && (
                <div className="text-xs text-muted-foreground px-3 py-1.5">{t('newDm.none')}</div>
              )}
              {peopleMatches.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onMemberClick(p.id)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-muted/50 transition-colors text-left"
                >
                  <Avatar user={{ id: p.id, name: p.name, avatar: p.avatar ?? undefined }} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{p.email}</div>
                  </div>
                  <MessageSquare className="size-3.5 text-muted-foreground shrink-0 opacity-60" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User footer → personal settings */}
        <div className="p-3 border-t border-border flex items-center gap-1.5">
          <button
            onClick={onSettings}
            className="flex-1 min-w-0 flex items-center gap-2.5 p-1.5 pr-2 rounded-xl hover:bg-muted/60 transition-colors text-left"
            aria-label={t('nav.settings')}
          >
            <div className="relative shrink-0">
              <Avatar user={user} size={34} />
              <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 border-2 border-card" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {user.role === 'dev' ? t('nav.devRole') : user.role === 'admin' ? t('nav.adminRights') : t('nav.member')}
              </div>
            </div>
            <Settings className="size-4 text-muted-foreground shrink-0" />
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onLogout}
            aria-label={t('nav.signOut')}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </aside>
    </>
  );
}

function FilterChip(props: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      className={`h-8 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1 transition-all border min-w-0
        ${props.active
          ? 'border-primary/40 bg-primary/15 text-foreground shadow-sm'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
    >
      {props.icon}
      <span className={`text-[10px] tabular-nums ${props.active ? 'text-primary' : 'text-muted-foreground/70'}`}>
        {props.count}
      </span>
    </button>
  );
}

// ============================================================================
// RoomItem — one row in the chat list
// ============================================================================

function RoomItem(props: {
  room: Room;
  active: boolean;
  onClick: () => void;
  preview?: RoomPreview;
  unread?: boolean;
  profileAvatar?: string;
  online?: boolean;
  myName: string;
  youLabel: string;
  dateLocale: string;
}) {
  const { room, active, onClick, preview, unread, profileAvatar, online, myName, youLabel, dateLocale } = props;
  const { t } = useI18n();
  const { roomPrefs } = useLocalSettings();
  const localPrefs = roomPrefs(room.id);
  const isPinned = !!localPrefs.pinnedTop;
  const isMuted = !!localPrefs.muted;
  const Icon = room.roomType === 'group' ? Users
    : room.kind === 'channel' ? Megaphone
    : MessageSquare;
  const mediaLabel = preview
    ? preview.mediaType === 'image' ? t('media.photo')
      : preview.mediaType === 'video' ? t('media.video')
      : preview.mediaType === 'audio' ? t('media.audio')
      : ''
    : '';
  const previewText = preview ? (preview.text || mediaLabel) : '';
  const prefix = preview && !preview.isAnonymous && room.roomType !== 'dm'
    ? `${preview.authorName === myName ? youLabel : preview.authorName}: `
    : '';

  return (
    <div
      className={`group room-item relative flex items-center gap-2.5 px-2 py-2 rounded-xl cursor-pointer text-sm min-w-0
        ${active ? 'bg-primary/15 text-foreground' : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full brand-mark" aria-hidden />}
      {room.roomType === 'dm' ? (
        <div className="relative shrink-0">
          <Avatar user={{ id: room.dmOtherUserId ?? room.id, name: room.name, avatar: profileAvatar }} size={38} />
          {online && <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 border-2 border-card" />}
        </div>
      ) : (
        <div className="room-avatar size-[38px]" style={{ background: roomColor(room) }}>
          <Icon className="size-[18px]" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate font-semibold text-[13.5px] flex-1 flex items-center gap-1">
            <span className="truncate">{room.name}</span>
            {isPinned && <Pin className="size-3 text-primary shrink-0" aria-label="pinned" />}
          </div>
          {isMuted && <BellOff className="size-3 text-muted-foreground shrink-0" aria-label="muted" />}
          {preview && (
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{formatListTime(preview.ts, dateLocale)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="text-[11.5px] truncate flex-1 word-safe">
            {preview ? (
              <span className={unread ? 'text-foreground font-medium' : ''}>{prefix}{previewText}</span>
            ) : (
              room.about && room.roomType !== 'dm' ? room.about : ''
            )}
          </div>
          {unread && <span className="brand-mark size-2 rounded-full shrink-0" aria-label="unread" />}
        </div>
      </div>
    </div>
  );
}
