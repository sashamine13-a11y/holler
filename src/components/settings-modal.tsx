'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar } from '@/components/avatar';
import { ModalShell } from '@/components/modals';
import { ThemeToggle } from '@/components/theme-toggle';
import { availableLocales, useI18n } from '@/lib/i18n';
import {
  ACCENT_PRESETS, FONT_SIZE_SCALE, WALLPAPER_PRESETS,
  useLocalSettings,
  type AccentColor, type FontSize, type Wallpaper, type SoundPreset,
} from '@/lib/local-settings';
import { AVATAR_DIM, AVATAR_MAX_BYTES, MAX_NAME_LEN, type User } from '@/lib/chat-types';
import { toast } from 'sonner';
import {
  Bell, Check, Database, ImagePlus, KeyRound, Lock, LogOut, Palette,
  ShieldCheck, Sun, Volume2, Wand2, Wrench, Terminal, Wifi, Users, MessageSquare,
} from 'lucide-react';

// Dev panel data passed from the app root (only rendered for role='dev')
export interface DevPanelInfo {
  userId: string;
  email: string;
  role: string;
  socketConnected: boolean;
  onlineCount: number;
  roomsCount: number;
  profilesCount: number;
  activeRoomId: string;
  activeRoomKind: string;
  messagesCount: number;
  onRefreshRooms: () => void;
  onClearCaches: () => void;
  getSnapshot: () => string;
}

// ============================================================================
// SettingsModal — comprehensive personal settings like a real messenger:
//   1. Profile (avatar + name)
//   2. Appearance (theme, accent, font size, density, wallpaper, reduce motion)
//   3. Chats & messages (send on Enter, seconds, 12h clock)
//   4. Notifications & sound (sound on send / receive, preset, desktop notifs)
//   5. Privacy (read receipts, typing visibility, online visibility)
//   6. Account (email, member since, password change, sign out)
//   7. Data & storage (clear cache, export, reset)
// ============================================================================

export function SettingsModal(props: {
  onClose: () => void;
  user: User;
  memberSince?: string;
  onUpdateProfile: (name: string, avatar?: string) => Promise<boolean>;
  onLogout: () => void;
  devInfo?: DevPanelInfo;
}) {
  const { onClose, user, memberSince, onUpdateProfile, onLogout, devInfo } = props;
  const { t, locale, setLocale, dateLocale } = useI18n();
  const { settings, update, reset } = useLocalSettings();

  // profile section
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState<string | undefined>(user.avatar);
  const [savingProfile, setSavingProfile] = useState(false);
  const profileDirty = name.trim() !== user.name || avatar !== user.avatar;
  const fileRef = useRef<HTMLInputElement>(null);

  // password section
  const [pwOpen, setPwOpen] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [repPw, setRepPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      toast.error(t('msg.onlyFormats'));
      return;
    }
    if (f.size > AVATAR_MAX_BYTES) {
      toast.error(t('msg.fileTooLarge'));
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
          toast.error(t('msg.imageTooLarge'));
          return;
        }
        setAvatar(url);
      };
      img.src = r.result as string;
    };
    r.readAsDataURL(f);
    e.target.value = '';
  };

  const saveProfile = async () => {
    if (!profileDirty || savingProfile) return;
    if (!name.trim()) { toast.error(t('profile.nameEmpty')); return; }
    setSavingProfile(true);
    const ok = await onUpdateProfile(name.trim(), avatar);
    setSavingProfile(false);
    if (ok) toast.success(t('profile.saved'));
  };

  const changePassword = async () => {
    if (pwBusy) return;
    if (!curPw || !newPw) return;
    if (newPw.length < 6) { toast.error(t('settings.passwordShort')); return; }
    if (newPw !== repPw) { toast.error(t('settings.mismatch')); return; }
    setPwBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      if (!supabase || !user.email) {
        toast.error(t('error'));
        return;
      }
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: curPw,
      });
      if (verifyErr) {
        toast.error(t('settings.wrongCurrent'));
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) {
        toast.error(t('error'));
        return;
      }
      toast.success(t('settings.passwordChanged'));
      setPwOpen(false);
      setCurPw(''); setNewPw(''); setRepPw('');
    } finally {
      setPwBusy(false);
    }
  };

  const exportSettings = () => {
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        locale,
        settings,
        profile: { name: user.name, email: user.email ?? null, avatar: user.avatar ?? null },
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `holler-settings-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('settings.exported'));
    } catch {
      toast.error(t('error'));
    }
  };

  const clearCache = () => {
    try {
      const keep = new Set(['holler_v1', 'holler_local_settings_v1', 'holler_room_prefs_v1', 'theme', 'holler_locale']);
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !keep.has(k)) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
      toast.success(t('settings.cacheCleared'));
    } catch {
      toast.error(t('error'));
    }
  };

  const resetSettings = () => {
    if (!confirm(t('settings.resetConfirm'))) return;
    reset();
    toast.success(t('settings.resetDone'));
  };

  const since = memberSince
    ? new Date(memberSince).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <ModalShell title={t('nav.settings')} onClose={onClose}>
      <div className="space-y-5 max-h-[68vh] overflow-y-auto scroll-thin pr-1">
        {/* ---------------- Profile ---------------- */}
        <section>
          <SectionTitle icon={<UserRoundSmall />} label={t('settings.profile')} />
          <div className="flex items-center gap-4 mt-2">
            <Avatar user={{ id: user.id, name: name || user.name, avatar }} size={64} />
            <div className="flex-1 min-w-0">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="hidden" />
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="size-4 mr-1" /> {t('profile.upload')}
                </Button>
                {avatar && (
                  <Button variant="ghost" size="sm" onClick={() => setAvatar(undefined)}>
                    {t('profile.remove')}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t('profile.avatarHint')}, {t('profile.willCrop')}.</p>
            </div>
          </div>
          <div className="mt-3">
            <Label htmlFor="st-name">{t('auth.name')}</Label>
            <Input
              id="st-name"
              maxLength={MAX_NAME_LEN}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {profileDirty && (
            <Button className="mt-2 w-full" onClick={saveProfile} disabled={savingProfile}>
              <Check className="size-4 mr-1.5" /> {t('profile.save')}
            </Button>
          )}
        </section>

        {/* ---------------- Appearance ---------------- */}
        <section className="border-t border-border pt-4">
          <SectionTitle icon={<Palette className="size-3.5" />} label={t('settings.appearance')} />

          {/* Theme */}
          <div className="mt-2 flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/40 border border-border">
            <div className="min-w-0">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <Sun className="size-4 text-amber-500" />
                {t('settings.themeLight')}
                <span className="text-muted-foreground">/</span>
                {t('settings.themeDark')}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t('settings.themeHint')}</p>
            </div>
            <ThemeToggle size="lg" />
          </div>

          {/* Accent */}
          <Label className="mt-3 block">{t('settings.accent')}</Label>
          <p className="text-xs text-muted-foreground mb-2">{t('settings.accentHint')}</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(ACCENT_PRESETS) as AccentColor[]).map(key => {
              const p = ACCENT_PRESETS[key];
              const on = settings.accent === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => update({ accent: key })}
                  className={`relative h-12 rounded-xl border overflow-hidden transition-all
                    ${on ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-muted-foreground'}`}
                  style={{ background: p.swatch }}
                  aria-label={p.label}
                >
                  {on && (
                    <span className="absolute top-1 right-1 size-5 rounded-full bg-white/95 flex items-center justify-center shadow">
                      <Check className="size-3 text-primary" />
                    </span>
                  )}
                  <span className="absolute bottom-1 left-1.5 text-[10px] font-medium text-white/95 drop-shadow">
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Font size */}
          <Label className="mt-3 block">{t('settings.fontSize')}</Label>
          <div className="opt-pill mt-1.5">
            {(['sm', 'md', 'lg'] as FontSize[]).map(f => (
              <button
                key={f}
                type="button"
                className={settings.font === f ? 'on' : ''}
                onClick={() => update({ font: f })}
              >
                {t(`settings.font.${f}`)}
              </button>
            ))}
          </div>

          {/* Density */}
          <Label className="mt-3 block">{t('settings.density')}</Label>
          <div className="opt-pill mt-1.5">
            <button type="button" className={settings.density === 'comfortable' ? 'on' : ''} onClick={() => update({ density: 'comfortable' })}>
              {t('settings.densityComfortable')}
            </button>
            <button type="button" className={settings.density === 'compact' ? 'on' : ''} onClick={() => update({ density: 'compact' })}>
              {t('settings.densityCompact')}
            </button>
          </div>

          {/* Wallpaper */}
          <Label className="mt-3 block">{t('settings.wallpaper')}</Label>
          <p className="text-xs text-muted-foreground mb-2">{t('settings.wallpaperHint')}</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(WALLPAPER_PRESETS) as Wallpaper[]).map(key => {
              const p = WALLPAPER_PRESETS[key];
              const on = settings.wallpaper === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => update({ wallpaper: key })}
                  className={`relative h-10 rounded-lg border overflow-hidden transition-all text-[11px]
                    ${on ? 'border-primary ring-2 ring-primary/30 text-foreground font-medium' : 'border-border hover:border-muted-foreground text-muted-foreground'}`}
                  style={key === 'none' ? { background: 'var(--card)' } : { backgroundImage: p.css }}
                >
                  <span className="absolute inset-0 flex items-center justify-center bg-card/40 backdrop-blur-[1px]">
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Reduce motion */}
          <div className="toggle-row mt-3">
            <div className="label">
              <span className="title">{t('settings.reduceMotion')}</span>
              <span className="hint">{t('settings.reduceMotionHint')}</span>
            </div>
            <Switch checked={settings.reduceMotion} onCheckedChange={v => update({ reduceMotion: v })} />
          </div>
        </section>

        {/* ---------------- Chats & messages ---------------- */}
        <section className="border-t border-border pt-4">
          <SectionTitle icon={<Wand2 className="size-3.5" />} label={t('settings.chats')} />
          <div className="mt-2 space-y-2">
            <div className="toggle-row">
              <div className="label">
                <span className="title">{t('settings.sendOnEnter')}</span>
                <span className="hint">{t('settings.sendOnEnterHint')}</span>
              </div>
              <Switch checked={settings.sendOnEnter} onCheckedChange={v => update({ sendOnEnter: v })} />
            </div>
            <div className="toggle-row">
              <div className="label">
                <span className="title">{t('settings.showSeconds')}</span>
                <span className="hint">{t('settings.showSecondsHint')}</span>
              </div>
              <Switch checked={settings.showSeconds} onCheckedChange={v => update({ showSeconds: v })} />
            </div>
            <div className="toggle-row">
              <div className="label">
                <span className="title">{t('settings.clock12h')}</span>
                <span className="hint">{t('settings.clock12hHint')}</span>
              </div>
              <Switch checked={settings.clock12h} onCheckedChange={v => update({ clock12h: v })} />
            </div>
          </div>
        </section>

        {/* ---------------- Notifications & sound ---------------- */}
        <section className="border-t border-border pt-4">
          <SectionTitle icon={<Bell className="size-3.5" />} label={t('settings.notifications')} />

          <div className="toggle-row mt-2">
            <div className="label">
              <span className="title flex items-center gap-1.5">
                <Volume2 className="size-3.5" /> {t('settings.soundOnSend')}
              </span>
              <span className="hint">{t('settings.soundOnSendHint')}</span>
            </div>
            <Switch checked={settings.soundOnSend} onCheckedChange={v => update({ soundOnSend: v })} />
          </div>
          <div className="toggle-row mt-2">
            <div className="label">
              <span className="title flex items-center gap-1.5">
                <Volume2 className="size-3.5" /> {t('settings.soundOnReceive')}
              </span>
              <span className="hint">{t('settings.soundOnReceiveHint')}</span>
            </div>
            <Switch checked={settings.soundOnReceive} onCheckedChange={v => update({ soundOnReceive: v })} />
          </div>

          <Label className="mt-3 block">{t('settings.soundPreset')}</Label>
          <p className="text-xs text-muted-foreground mb-2">{t('settings.soundPresetHint')}</p>
          <div className="grid grid-cols-5 gap-2">
            {(['none', 'pop', 'chime', 'ding', 'soft'] as SoundPreset[]).map(s => {
              const on = settings.soundPreset === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => update({ soundPreset: s })}
                  className={`px-2 py-2 rounded-lg border text-[11px] capitalize transition-all
                    ${on ? 'border-primary bg-primary/10 text-foreground font-medium' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
                >
                  {t(`settings.sound.${s}`)}
                </button>
              );
            })}
          </div>

          <div className="toggle-row mt-3">
            <div className="label">
              <span className="title">{t('settings.desktopNotifications')}</span>
              <span className="hint">{t('settings.desktopNotificationsHint')}</span>
            </div>
            <Switch
              checked={settings.desktopNotifications}
              onCheckedChange={v => {
                if (v && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
                  Notification.requestPermission().then(p => {
                    if (p === 'granted') update({ desktopNotifications: true });
                    else toast.error(t('settings.notificationsBlocked'));
                  });
                } else {
                  update({ desktopNotifications: v });
                }
              }}
            />
          </div>
        </section>

        {/* ---------------- Privacy ---------------- */}
        <section className="border-t border-border pt-4">
          <SectionTitle icon={<ShieldCheck className="size-3.5" />} label={t('settings.privacy')} />
          <div className="mt-2 space-y-2">
            <div className="toggle-row">
              <div className="label">
                <span className="title">{t('settings.readReceipts')}</span>
                <span className="hint">{t('settings.readReceiptsHint')}</span>
              </div>
              <Switch checked={settings.readReceipts} onCheckedChange={v => update({ readReceipts: v })} />
            </div>
            <div className="toggle-row">
              <div className="label">
                <span className="title">{t('settings.typingVisible')}</span>
                <span className="hint">{t('settings.typingVisibleHint')}</span>
              </div>
              <Switch checked={settings.typingVisible} onCheckedChange={v => update({ typingVisible: v })} />
            </div>
            <div className="toggle-row">
              <div className="label">
                <span className="title">{t('settings.onlineVisible')}</span>
                <span className="hint">{t('settings.onlineVisibleHint')}</span>
              </div>
              <Switch checked={settings.onlineVisible} onCheckedChange={v => update({ onlineVisible: v })} />
            </div>
          </div>
        </section>

        {/* ---------------- Language ---------------- */}
        <section className="border-t border-border pt-4">
          <SectionTitle icon={<span className="text-sm leading-none">🌐</span>} label={t('settings.language')} />
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">{t('settings.languageHint')}</p>
          <div className="grid grid-cols-2 gap-2">
            {availableLocales.map(l => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLocale(l.code)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors text-left
                  ${locale === l.code ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'}`}
              >
                <span className="text-base leading-none">{l.flag}</span>
                <span className={`truncate ${locale === l.code ? 'font-medium' : ''}`}>{l.name}</span>
                {locale === l.code && <Check className="size-4 text-primary ml-auto shrink-0" />}
              </button>
            ))}
          </div>
        </section>

        {/* ---------------- Account ---------------- */}
        <section className="border-t border-border pt-4">
          <SectionTitle icon={<KeyRound className="size-3.5" />} label={t('settings.account')} />
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground shrink-0">{t('auth.email')}</span>
              <span className="truncate font-medium">{user.email ?? '—'}</span>
            </div>
            {since && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground shrink-0">{t('settings.memberSince')}</span>
                <span className="font-medium">{since}</span>
              </div>
            )}

            {!pwOpen ? (
              <Button variant="outline" className="w-full mt-1" onClick={() => setPwOpen(true)}>
                <KeyRound className="size-4 mr-1.5" /> {t('settings.changePassword')}
              </Button>
            ) : (
              <div className="p-3 rounded-xl border border-border bg-muted/30 space-y-2 mt-1">
                <Input
                  type="password"
                  placeholder={t('settings.currentPassword')}
                  value={curPw}
                  onChange={(e) => setCurPw(e.target.value)}
                  autoComplete="current-password"
                />
                <Input
                  type="password"
                  placeholder={t('settings.newPassword')}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  autoComplete="new-password"
                />
                <Input
                  type="password"
                  placeholder={t('settings.confirmPassword')}
                  value={repPw}
                  onChange={(e) => setRepPw(e.target.value)}
                  autoComplete="new-password"
                />
                <p className="text-[11px] text-muted-foreground">{t('settings.passwordHint')}</p>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setPwOpen(false); setCurPw(''); setNewPw(''); setRepPw(''); }}>
                    {t('cancel')}
                  </Button>
                  <Button size="sm" onClick={changePassword} disabled={pwBusy || !curPw || !newPw || !repPw}>
                    {t('settings.changePassword')}
                  </Button>
                </div>
              </div>
            )}

            <Button
              variant="ghost"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => { onClose(); onLogout(); }}
            >
              <LogOut className="size-4 mr-1.5" /> {t('nav.signOut')}
            </Button>
          </div>
        </section>

        {/* ---------------- Data & storage ---------------- */}
        <section className="border-t border-border pt-4">
          <SectionTitle icon={<Database className="size-3.5" />} label={t('settings.data')} />
          <div className="mt-2 grid grid-cols-1 gap-2">
            <Button variant="outline" className="w-full justify-start" onClick={exportSettings}>
              <Lock className="size-4 mr-1.5" /> {t('settings.export')}
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={clearCache}>
              <Database className="size-4 mr-1.5" /> {t('settings.clearCache')}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={resetSettings}
            >
              <Wand2 className="size-4 mr-1.5" /> {t('settings.reset')}
            </Button>
          </div>
        </section>

        {/* ---------------- Developer (role=dev only) ---------------- */}
        {devInfo && (
          <section className="border-t border-border pt-4">
            <SectionTitle icon={<Wrench className="size-3.5 text-cyan-500" />} label={t('dev.section')} />
            <p className="text-xs text-muted-foreground mt-1">{t('dev.hint')}</p>

            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3 mt-2 space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{t('dev.identity')}</div>
                <div className="text-xs font-mono break-all space-y-0.5">
                  <div>id: <span className="text-cyan-600">{devInfo.userId}</span></div>
                  <div>email: {devInfo.email || '—'}</div>
                  <div>role: <span className="text-cyan-600 font-bold">{devInfo.role}</span></div>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{t('dev.connection')}</div>
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Wifi className="size-3.5 shrink-0" />
                    realtime: {devInfo.socketConnected
                      ? <span className="text-emerald-500 font-medium">connected</span>
                      : <span className="text-destructive font-medium">offline</span>}
                    <span className="text-muted-foreground">· {devInfo.onlineCount} online</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{t('dev.stats')}</div>
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-1.5"><Users className="size-3.5 shrink-0" /> rooms: {devInfo.roomsCount} · profiles: {devInfo.profilesCount}</div>
                  <div className="flex items-center gap-1.5"><MessageSquare className="size-3.5 shrink-0" /> messages in state: {devInfo.messagesCount}</div>
                  <div className="flex items-center gap-1.5"><Terminal className="size-3.5 shrink-0" /> active: <span className="font-mono break-all">{devInfo.activeRoomId || '—'} {devInfo.activeRoomKind && `(${devInfo.activeRoomKind})`}</span></div>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{t('dev.actions')}</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  <Button
                    variant="outline" size="sm" className="h-8 text-xs"
                    onClick={() => {
                      navigator.clipboard?.writeText(devInfo.getSnapshot());
                      toast.success(t('dev.snapshotCopied'));
                    }}
                  >
                    <Terminal className="size-3.5 mr-1" /> {t('dev.copySnapshot')}
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={devInfo.onRefreshRooms}>
                    <Database className="size-3.5 mr-1" /> {t('dev.refreshRooms')}
                  </Button>
                  <Button
                    variant="outline" size="sm" className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                    onClick={devInfo.onClearCaches}
                  >
                    <Wand2 className="size-3.5 mr-1" /> {t('dev.clearCaches')}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}

        <p className="text-[11px] text-muted-foreground text-center border-t border-border pt-3">
          {t('settings.aboutApp')}
        </p>
      </div>
    </ModalShell>
  );
}

function SectionTitle(props: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
      {props.icon}
      {props.label}
    </div>
  );
}

function UserRoundSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
      <circle cx="12" cy="8" r="4" />
      <path d="M5.5 21a8 8 0 0 1 13 0" />
    </svg>
  );
}
