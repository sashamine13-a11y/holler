// Патчит src/components/client-app.tsx для статического хостинга (Cloudflare Pages).
// Заменяет:
//   - fetch('/api/join') → joinClass() (client-side проверка)
// Ably НЕ stub'им — он работает на static hosting (через NEXT_PUBLIC_ABLY_KEY).

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/components/client-app.tsx';
const content = readFileSync(FILE, 'utf8');

let patched = content;

// 1. Добавляем импорт joinClass после последнего импорта.
if (!content.includes('joinClass')) {
  const lines = content.split('\n');
  let insertAfter = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.includes('from ') && (trimmed.endsWith("';") || trimmed.endsWith('";'))) {
      insertAfter = i;
    }
    if (insertAfter !== -1 && trimmed !== '' && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*') && !trimmed.includes('from ')) {
      break;
    }
  }
  if (insertAfter === -1) {
    throw new Error('Cannot find end of imports');
  }
  lines.splice(insertAfter + 1, 0, "import { joinClass } from '@/lib/client-join';");
  patched = lines.join('\n');
  console.log('✅ import added after line', insertAfter + 1);
} else {
  console.log('⚠️  joinClass already imported');
}

// 2. Заменяем handleJoin: fetch('/api/join') → joinClass()
const oldHandleJoin = `  const handleJoin = async (code: string, name: string): Promise<boolean> => {
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
      toast.success(\`Welcome, \${user.name}!\`);
      return true;
    } catch {
      toast.error('Network unavailable');
      return false;
    }
  };`;

const newHandleJoin = `  const handleJoin = async (code: string, name: string): Promise<boolean> => {
    try {
      const result = await joinClass(code, name);
      if (!result.ok || !result.user) {
        toast.error(result.error || 'Login error');
        return false;
      }
      const user: User = { id: uid('u'), name: result.user.name, role: result.user.role };
      setState(prev => ({ ...prev, user }));
      setShowJoin(false);
      toast.success(\`Welcome, \${user.name}!\`);
      return true;
    } catch {
      toast.error('Network unavailable');
      return false;
    }
  };`;

if (patched.includes(oldHandleJoin)) {
  patched = patched.replace(oldHandleJoin, newHandleJoin);
  console.log('✅ handleJoin patched (fetch → joinClass)');
} else {
  console.log('⚠️  handleJoin not found (already patched?)');
}

writeFileSync(FILE, patched);
console.log('✅ Patch applied to', FILE);
console.log('ℹ️  Ably useRealtime hook is NOT stubbed — it works on static hosting via NEXT_PUBLIC_ABLY_KEY');
