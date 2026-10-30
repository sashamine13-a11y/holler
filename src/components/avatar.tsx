'use client';

import { avColor, initials, safeDataUrl } from '@/lib/chat-types';

export function Avatar(props: { user: { id: string; name: string; avatar?: string }; size?: number }) {
  const { user, size = 36 } = props;
  const safe = safeDataUrl(user.avatar, 100_000);
  if (safe) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={safe}
        alt={user.name}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, background: avColor(user.id), fontSize: size * 0.4 }}
    >
      {initials(user.name)}
    </div>
  );
}
