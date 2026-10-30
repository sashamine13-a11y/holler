'use client';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useI18n, availableLocales, type Locale } from '@/lib/i18n';
import { Check } from 'lucide-react';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const current = availableLocales.find(l => l.code === locale);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('settings.language')}
          title={current?.name}
          className="shrink-0 text-base leading-none"
        >
          <span aria-hidden>{current?.flag ?? '🌐'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="dropdown-in">
        {availableLocales.map(l => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLocale(l.code as Locale)}
            className={locale === l.code ? 'bg-primary/10' : ''}
          >
            <span className="mr-2">{l.flag}</span>
            {l.name}
            {locale === l.code && <Check className="ml-auto size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
