'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar } from '@/components/avatar';
import { ModalShell } from '@/components/modals';
import { loadRoomMembers, type DbProfile, type RoomMemberWithProfile } from '@/lib/api';
import { useLocalSettings } from '@/lib/local-settings';
import { CATEGORIES, MAX_ABOUT_LEN, type Room } from '@/lib/chat-types';
import {
  BellOff, Check, Crown, DoorOpen, Hourglass, Megaphone, MessageSquare, Minus, Pin,
  PinOff, Search, Shield, Trash2, UserPlus, Users, User as UserIcon,
} from 'lucide-react';

// ============================================================================
// RoomSettingsModal — working settings for channels / chats / groups / DMs.
//  - rename, about, category (persisted via rooms table)
//  - group members: list with roles, add / remove / leave
//  - danger zone: delete room
// ============================================================================

export function RoomSettingsModal(props: {
  onClose: () => void;
  room: Room;
  profiles: DbProfile[];
  currentUserId: string;
  globalAdmin: boolean;
  myMembershipRole: 'member' | 'admin' | null;
  onUpdateRoom: (patch: { name: string; about: string; category: string }) => Promise<boolean>;
  onDeleteRoom: () => void;
  onLeaveGroup: () => void;
  onAddMembers: (ids: string[]) => Promise<boolean>;
  onRemoveMember: (userId: string) => Promise<boolean>;
  t: (key: string) => string;
  dateLocale: string;
}) {
  const {
    onClose, room, profiles, currentUserId, globalAdmin, myMembershipRole,
    onUpdateRoom, onDeleteRoom, onLeaveGroup, onAddMembers, onRemoveMember, t, dateLocale,
  } = props;

  const isGroup = room.roomType === 'group';
  const isDm = room.roomType === 'dm';
  const canManageMembers = isGroup
    && (room.createdBy === currentUserId || myMembershipRole === 'admin' || globalAdmin);
  const canEditFields = isDm ? false
    : isGroup ? canManageMembers
    : (globalAdmin || room.createdBy === currentUserId);
  const canDelete = isDm ? true
    : isGroup ? canManageMembers
    : room.kind === 'channel' ? globalAdmin
    : true;

  // ---- local per-room prefs (pin to top / mute) ----
  const { roomPrefs, setRoomPref } = useLocalSettings();
  const localPrefs = roomPrefs(room.id);
  const isPinnedTop = !!localPrefs.pinnedTop;
  const isMuted = !!localPrefs.muted;

  // ---- editable fields ----
  const [name, setName] = useState(room.name);
  const [about, setAbout] = useState(room.about ?? '');
  const [category, setCategory] = useState(room.category ?? 'general');
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== room.name
    || about.trim() !== (room.about ?? '')
    || category !== (room.category ?? 'general');

  // ---- members ----
  const [members, setMembers] = useState<RoomMemberWithProfile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(isGroup);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [memberQuery, setMemberQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isGroup) return;
    let cancelled = false;
    setLoadingMembers(true);
    loadRoomMembers(room.id).then(list => {
      if (!cancelled) setMembers(list);
    }).finally(() => { if (!cancelled) setLoadingMembers(false); });
    return () => { cancelled = true; };
  }, [room.id, isGroup]);

  const memberIds = useMemo(() => new Set(members.map(m => m.user_id)), [members]);

  const addableProfiles = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return profiles
      .filter(p => !memberIds.has(p.id))
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q));
  }, [profiles, memberIds, memberQuery]);

  const otherUser = isDm
    ? profiles.find(p => p.id === room.dmOtherUserId)
    : undefined;

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    const ok = await onUpdateRoom({
      name: name.trim().slice(0, 64) || room.name,
      about: about.trim().slice(0, MAX_ABOUT_LEN),
      category,
    });
    setSaving(false);
    if (ok) onClose();
  };

  const handleAdd = async () => {
    if (picked.size === 0 || busy) return;
    setBusy(true);
    const ok = await onAddMembers(Array.from(picked));
    setBusy(false);
    if (ok) {
      const fresh = await loadRoomMembers(room.id);
      setMembers(fresh);
      setPicked(new Set());
      setAdding(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (busy) return;
    setBusy(true);
    const ok = await onRemoveMember(userId);
    setBusy(false);
    if (ok) setMembers(prev => prev.filter(m => m.user_id !== userId));
  };

  const typeLabel = isDm ? t('room.dm')
    : isGroup ? t('room.group')
    : room.kind === 'channel' ? t('room.channel')
    : t('room.chat');

  const createdAt = room.createdAt
    ? new Date(room.createdAt).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <ModalShell
      title={isDm ? (room.name || otherUser?.name || t('room.settingsDm'))
        : isGroup ? t('room.settingsGroup')
        : room.kind === 'channel' ? t('room.settingsChannel')
        : t('room.settings')}
      description={isDm ? t('room.dmPrivacy') : room.about || undefined}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2 w-full justify-between flex-wrap">
          {canDelete && !isDm ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onDeleteRoom}
            >
              <Trash2 className="size-4 mr-1.5" /> {t('room.deleteRoom')}
            </Button>
          ) : isDm ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onDeleteRoom}
            >
              <Trash2 className="size-4 mr-1.5" /> {t('delete')}
            </Button>
          ) : <span />}
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" onClick={onClose}>{t('close')}</Button>
            {canEditFields && (
              <Button onClick={handleSave} disabled={!dirty || saving}>
                <Check className="size-4 mr-1.5" /> {t('room.saveChanges')}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5 max-h-[60vh] overflow-y-auto scroll-thin pr-1">
        {/* DM: other user card */}
        {isDm && otherUser && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
            <Avatar user={{ id: otherUser.id, name: otherUser.name, avatar: otherUser.avatar ?? undefined }} size={44} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate word-safe">{otherUser.name}</div>
              <div className="text-xs text-muted-foreground truncate">{otherUser.email}</div>
            </div>
          </div>
        )}

        {/* Editable fields (not for DMs) */}
        {!isDm && (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <Badge variant="outline" className="capitalize">{typeLabel}</Badge>
              {createdAt && <span>{t('room.created')} {createdAt}</span>}
            </div>

            {canEditFields ? (
              <>
                <div>
                  <Label htmlFor="rs-name">{t('room.rename')}</Label>
                  <Input
                    id="rs-name"
                    value={name}
                    maxLength={64}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="rs-about">{t('room.about')}</Label>
                  <Input
                    id="rs-about"
                    placeholder={t('newRoom.aboutHint')}
                    value={about}
                    maxLength={MAX_ABOUT_LEN}
                    onChange={(e) => setAbout(e.target.value)}
                  />
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
              </>
            ) : (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('room.rename')}</span>
                <span className="font-medium truncate max-w-[60%] word-safe">{room.name}</span>
              </div>
            )}
          </>
        )}

        {/* Group members — separate per-group list (not the global service list) */}
        {isGroup && (
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-1.5">
                <Users className="size-3.5" /> {t('room.groupMembers')}
                <span className="text-muted-foreground font-normal">· {members.length}</span>
              </Label>
              {canManageMembers && (
                <Button variant="outline" size="sm" className="h-7" onClick={() => setAdding(a => !a)}>
                  <UserPlus className="size-3.5 mr-1" /> {t('room.addMember')}
                </Button>
              )}
            </div>

            {/* Add-member picker */}
            {adding && canManageMembers && (
              <div className="mb-3 p-2.5 rounded-xl border border-border bg-muted/30 space-y-2">
                <div className="relative">
                  <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder={t('nav.searchUsers')}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto scroll-thin divide-y divide-border rounded-lg border border-border">
                  {addableProfiles.length === 0 && (
                    <div className="px-3 py-3 text-center text-xs text-muted-foreground">
                      {t('room.noMembersToAdd')}
                    </div>
                  )}
                  {addableProfiles.map(p => {
                    const on = picked.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-muted/50 text-left transition-colors"
                        onClick={() => setPicked(prev => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                          return next;
                        })}
                      >
                        <Avatar user={{ id: p.id, name: p.name, avatar: p.avatar ?? undefined }} size={26} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate">{p.name}</div>
                        </div>
                        <span className={`size-4 rounded-md border flex items-center justify-center shrink-0
                          ${on ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                          {on && <Check className="size-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => { setAdding(false); setPicked(new Set()); }}>
                    {t('cancel')}
                  </Button>
                  <Button size="sm" className="h-7" onClick={handleAdd} disabled={picked.size === 0 || busy}>
                    <UserPlus className="size-3.5 mr-1" /> {t('room.addMember')} {picked.size > 0 ? `(${picked.size})` : ''}
                  </Button>
                </div>
              </div>
            )}

            {/* Member list */}
            <div className="rounded-xl border border-border divide-y divide-border max-h-56 overflow-y-auto scroll-thin">
              {loadingMembers && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">{t('loading')}</div>
              )}
              {!loadingMembers && members.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">{t('group.noUsers')}</div>
              )}
              {members.map(m => {
                const p = m.profile;
                const displayName = p?.name ?? m.user_id.slice(0, 8);
                const isMe = m.user_id === currentUserId;
                const isOwner = room.createdBy === m.user_id;
                const canRemoveThis = canManageMembers && !isMe;
                return (
                  <div key={m.id} className="flex items-center gap-2.5 px-2.5 py-2">
                    <Avatar user={{ id: m.user_id, name: displayName, avatar: p?.avatar ?? undefined }} size={30} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate word-safe flex items-center gap-1.5">
                        <span className="truncate">{displayName}</span>
                        {isMe && <span className="text-[10px] text-muted-foreground font-normal">{t('room.youTag')}</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{p?.email}</div>
                    </div>
                    {isOwner ? (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 gap-0.5 shrink-0 border-amber-500/50 text-amber-600">
                        <Crown className="size-2.5" /> {t('room.ownerTag')}
                      </Badge>
                    ) : m.role === 'admin' ? (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 gap-0.5 shrink-0">
                        <Shield className="size-2.5" /> {t('room.adminTag')}
                      </Badge>
                    ) : null}
                    {canRemoveThis && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemove(m.user_id)}
                        disabled={busy}
                        aria-label={t('room.removeMember')}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Leave group */}
            <Button
              variant="outline"
              className="w-full mt-3 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={onLeaveGroup}
            >
              <DoorOpen className="size-4 mr-1.5" /> {t('room.leaveGroup')}
            </Button>
          </div>
        )}

        {/* Per-room local preferences — pin to top + mute */}
        <div className="border-t border-border pt-4 space-y-2">
          <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            <BellOff className="size-3" /> {t('room.localPrefs')}
          </Label>

          <div className="toggle-row">
            <div className="label">
              <span className="title flex items-center gap-1.5">
                {isPinnedTop ? <Pin className="size-3.5 text-primary" /> : <PinOff className="size-3.5" />}
                {t('room.pinToTop')}
              </span>
              <span className="hint">{t('room.pinToTopHint')}</span>
            </div>
            <Switch
              checked={isPinnedTop}
              onCheckedChange={v => setRoomPref(room.id, { pinnedTop: v })}
            />
          </div>

          <div className="toggle-row">
            <div className="label">
              <span className="title flex items-center gap-1.5">
                {isMuted ? <BellOff className="size-3.5 text-muted-foreground" /> : <MessageSquare className="size-3.5" />}
                {t('room.mute')}
              </span>
              <span className="hint">{t('room.muteHint')}</span>
            </div>
            <Switch
              checked={isMuted}
              onCheckedChange={v => setRoomPref(room.id, { muted: v })}
            />
          </div>
        </div>

        {/* Admin info: slow mode + welcome (display only, mock behavior marker) */}
        {canEditFields && !isDm && (
          <div className="border-t border-border pt-4 space-y-2">
            <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              <Hourglass className="size-3" /> {t('room.adminTools')}
            </Label>
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t('room.slowMode')}</div>
                  <p className="text-xs text-muted-foreground">{t('room.slowModeHint')}</p>
                </div>
                <Badge variant="outline" className="shrink-0">10s</Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t('room.welcomeMsg')}</div>
                  <p className="text-xs text-muted-foreground">{t('room.welcomeMsgHint')}</p>
                </div>
                <Switch defaultChecked={false} />
              </div>
            </div>
          </div>
        )}

        {/* Read-only info footer */}
        {!isGroup && !isDm && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3">
            <span className="inline-flex items-center gap-1.5">
              {room.kind === 'channel' ? <Megaphone className="size-3.5" /> : <MessageSquare className="size-3.5" />}
              {room.kind === 'channel' ? t('room.channelReadonly') : t('room.chatEveryone')}
            </span>
          </div>
        )}
        {isDm && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-3">
            <UserIcon className="size-3.5 shrink-0" />
            <span>{t('room.dmPrivacy')}</span>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
