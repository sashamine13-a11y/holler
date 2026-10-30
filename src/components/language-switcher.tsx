'use client';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';
import { useI18n, availableLocales, type Locale } from '@/lib/i18n';

export function LanguageSwitcher() {
  const { locale, changeLocale, t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change language" className="shrink-0">
          <Globe className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {availableLocales.map(l => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => changeLocale(l.code as Locale)}
            className={locale === l.code ? 'bg-primary/10' : ''}
          >
            <span className="mr-2">{l.flag}</span>
            {l.name}
            {locale === l.code && <span className="ml-auto text-primary">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
