'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar } from '@/components/avatar';
import { ModalShell } from '@/components/modals';
import { ThemeToggle } from '@/components/theme-toggle';
import { availableLocales, useI18n } from '@/lib/i18n';
import { AVATAR_DIM, AVATAR_MAX_BYTES, MAX_NAME_LEN, type User } from '@/lib/chat-types';
import { toast } from 'sonner';
import {
  Check, ImagePlus, KeyRound, LogOut, Palette, Sun, UserRound,
} from 'lucide-react';

// ============================================================================
// SettingsModal — personal settings like in a real messenger:
// profile (avatar + name), appearance (animated theme), language, account
// (email, member since, password change, sign out)
// ============================================================================

export function SettingsModal(props: {
  onClose: () => void;
  user: User;
  memberSince?: string;
  onUpdateProfile: (name: string, avatar?: string) => Promise<boolean>;
  onLogout: () => void;
}) {
  const { onClose, user, memberSince, onUpdateProfile, onLogout } = props;
  const { t, locale, setLocale, dateLocale } = useI18n();

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
      // Verify the current password first (like a real messenger)
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

  const since = memberSince
    ? new Date(memberSince).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <ModalShell title={t('nav.settings')} onClose={onClose}>
      <div className="space-y-5 max-h-[62vh] overflow-y-auto scroll-thin pr-1">
        {/* ---------------- Profile ---------------- */}
        <section>
          <SectionTitle icon={<UserRound className="size-3.5" />} label={t('settings.profile')} />
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
