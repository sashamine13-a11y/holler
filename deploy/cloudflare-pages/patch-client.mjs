// Патчит src/components/client-app.tsx для статического хостинга.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/components/client-app.tsx';
const content = readFileSync(FILE, 'utf8');

let patched = content;

// 1. Находим последний импорт (строка, заканчивающаяся на `';` или `";`)
//    и вставляем наш импорт после неё.
if (!content.includes('joinClass')) {
  const lines = content.split('\n');
  let insertAfter = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Импорт заканчивается, если строка оканчивается на `;` и содержит `from `
    if (trimmed.includes('from ') && (trimmed.endsWith("';") || trimmed.endsWith('";'))) {
      insertAfter = i;
    }
    // Останавливаемся, когда дошли до первого не-import кода (не пустая, не комментарий, не продолжение)
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

// 2. Заменяем handleJoin
const oldHandleJoin = `  const handleJoin = async (code: string, name: string): Promise<boolean> => {
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
      const user: User = { id: uid('u'), name: data.user.name, role: data.user.role };
      setState(prev => ({ ...prev, user }));
      setShowJoin(false);
      toast.success(\`Добро пожаловать, \${user.name}!\`);
      return true;
    } catch {
      toast.error('Сеть недоступна');
      return false;
    }
  };`;

const newHandleJoin = `  const handleJoin = async (code: string, name: string): Promise<boolean> => {
    try {
      const result = await joinClass(code, name);
      if (!result.ok || !result.user) {
        toast.error(result.error || 'Ошибка входа');
        return false;
      }
      const user: User = { id: uid('u'), name: result.user.name, role: result.user.role };
      setState(prev => ({ ...prev, user }));
      setShowJoin(false);
      toast.success(\`Добро пожаловать, \${user.name}!\`);
      return true;
    } catch {
      toast.error('Сеть недоступна');
      return false;
    }
  };`;

if (patched.includes(oldHandleJoin)) {
  patched = patched.replace(oldHandleJoin, newHandleJoin);
  console.log('✅ handleJoin patched');
} else {
  console.log('⚠️  handleJoin not found');
}

// 3. WebSocket-хук: на статическом хостинге нет WS, делаем no-op.
const oldUseSocket = `  const { socket, isConnected, onlineMembers } = useSocket({ user: state.user });`;
const newUseSocket = `  // На статическом хостинге WebSocket недоступен — заглушка
  const socket = null;
  const isConnected = false;
  const onlineMembers: OnlineMember[] = [];`;

if (patched.includes(oldUseSocket)) {
  patched = patched.replace(oldUseSocket, newUseSocket);
  console.log('✅ useSocket stubbed');
} else {
  console.log('⚠️  useSocket not found');
}

writeFileSync(FILE, patched);
console.log('✅ Patch applied to', FILE);
