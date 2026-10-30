'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useI18n } from '@/lib/i18n';

type Theme = 'light' | 'dark';

const THEME_KEY = 'theme';

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Apply a theme with a cinematic circular reveal expanding from the click
 * point (View Transitions API). Falls back to an instant swap when the API
 * is unavailable or the user prefers reduced motion.
 */
function applyTheme(next: Theme, origin?: { x: number; y: number }) {
  const root = document.documentElement;
  const apply = () => {
    root.classList.toggle('dark', next === 'dark');
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  };

  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const supportsVT = typeof document.startViewTransition === 'function';

  if (origin && !reduced && supportsVT) {
    try {
      const vt = document.startViewTransition(apply);
      vt.ready.then(() => {
        const { x, y } = origin;
        const radius = Math.hypot(
          Math.max(x, window.innerWidth - x),
          Math.max(y, window.innerHeight - y),
        );
        root.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 620,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      }).catch(() => { /* transition skipped */ });
      return;
    } catch { /* fall through to instant swap */ }
  }
  apply();
}

// ---------------------------------------------------------------------------
// Icons — sun & moon whose gradient fill "paints in" for the active theme
// ---------------------------------------------------------------------------

function SunIcon({ active, size }: { active: boolean; size: number }) {
  const gid = useId();
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      className={`theme-icon ${active ? 'is-active' : ''}`}
    >
      <defs>
        <radialGradient id={gid} cx="50%" cy="42%" r="70%">
          <stop offset="0%" stopColor="#ffd76e" />
          <stop offset="70%" stopColor="#ffb545" />
          <stop offset="100%" stopColor="#ff8f3c" />
        </radialGradient>
      </defs>
      {/* Painted core — scales in only in light theme */}
      <circle
        className="fill-wipe"
        cx="12"
        cy="12"
        r="4.6"
        fill={`url(#${gid})`}
        stroke="none"
      />
      {/* Outline core */}
      <circle
        cx="12"
        cy="12"
        r="4.6"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
      <g className="rays" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="12" y1="2.2" x2="12" y2="4.4" />
        <line x1="12" y1="19.6" x2="12" y2="21.8" />
        <line x1="2.2" y1="12" x2="4.4" y2="12" />
        <line x1="19.6" y1="12" x2="21.8" y2="12" />
        <line x1="5.1" y1="5.1" x2="6.65" y2="6.65" />
        <line x1="17.35" y1="17.35" x2="18.9" y2="18.9" />
        <line x1="5.1" y1="18.9" x2="6.65" y2="17.35" />
        <line x1="17.35" y1="6.65" x2="18.9" y2="5.1" />
      </g>
    </svg>
  );
}

function MoonIcon({ active, size }: { active: boolean; size: number }) {
  const gid = useId();
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      className={`theme-icon ${active ? 'is-active' : ''}`}
    >
      <defs>
        <linearGradient id={gid} x1="6" y1="4" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="55%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      {/* Painted crescent — scales in only in dark theme */}
      <path
        className="fill-wipe"
        d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
        fill={`url(#${gid})`}
        stroke="none"
      />
      {/* Outline crescent */}
      <path
        d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Twinkling stars appear only when the moon is painted */}
      <g className="stars" fill="currentColor">
        <circle className="star" cx="17.4" cy="5.4" r="0.9" style={{ animationDelay: '0s' }} />
        <circle className="star" cx="20.2" cy="9.8" r="0.7" style={{ animationDelay: '0.6s' }} />
        <circle className="star" cx="14.9" cy="3.1" r="0.55" style={{ animationDelay: '1.1s' }} />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Toggle widget
// ---------------------------------------------------------------------------

export function ThemeToggle({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setMounted(true);
    setTheme(currentTheme());
  }, []);

  const toggle = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next, { x: e.clientX, y: e.clientY });
  }, [theme]);

  if (!mounted) {
    return <div className={size === 'lg' ? 'w-[92px] h-11' : 'w-[62px] h-8'} aria-hidden />;
  }

  const isLight = theme === 'light';
  const iconSize = size === 'lg' ? 20 : 16;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? t('nav.switchDark') : t('nav.switchLight')}
      title={isLight ? t('nav.switchDark') : t('nav.switchLight')}
      onClick={toggle}
      className={`theme-switch shrink-0 ${size === 'lg' ? 'theme-switch-lg' : ''}`}
      data-theme={theme}
    >
      {/* Sliding knob behind the active icon */}
      <span className="theme-knob" aria-hidden />
      <SunIcon active={isLight} size={iconSize} />
      <MoonIcon active={!isLight} size={iconSize} />
    </button>
  );
}
