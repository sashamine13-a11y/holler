'use client';

export type Role = 'member' | 'admin' | 'dev';
export type RoomKind = 'channel' | 'chat';
export type RoomCategory = string;

export interface User {
  id: string;
  name: string;
  role: Role;
  avatar?: string;
  email?: string;
  username?: string;
  about?: string;
}

export interface Message {
  id: string;
  authorId: string;
  authorName: string;
  role?: Role;
  text: string;
  ts: number;
  anon?: boolean;
  image?: string;
  mediaType?: 'image' | 'video' | 'audio';
  replyTo?: string;
  replySnippet?: string;
  forwardedFrom?: string;
  forwardedBy?: string;
  deletedAt?: number;
  editedAt?: number;
}

export interface PollOption { t: string; votes: string[]; }

export interface Poll {
  id: string;
  room: string;
  q: string;
  options: PollOption[];
  ts: number;
  authorId: string;
}

export interface AnonQuestion {
  id: string;
  room: string;
  q: string;
  answers: { text: string; ts: number }[];
  answered: boolean;
  authorId: string;
}

export interface Pinned { room: string; messageId?: string; text: string; ts: number; }

export interface Room {
  id: string;
  name: string;
  kind: RoomKind;
  roomType: 'channel' | 'dm' | 'group';
  category?: RoomCategory;
  about?: string;
  messages: Message[];
  dmOtherUserId?: string;
  dmOtherName?: string;
  groupMembers?: string[];
  createdBy?: string;
  createdAt?: number;
  commentsEnabled?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_DIM = 160;
export const MAX_MSG_LEN = 2000;
export const MAX_NAME_LEN = 32;
export const MAX_ABOUT_LEN = 120;
export const MAX_USER_ABOUT_LEN = 140;
export const MAX_USERNAME_LEN = 20;
export const MIN_USERNAME_LEN = 3;

export const CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'study', label: 'Study' },
  { id: 'life', label: 'Class Life' },
  { id: 'shop', label: 'Marketplace' },
  { id: 'sport', label: 'Sport' },
  { id: 'creative', label: 'Creative' },
  { id: 'other', label: 'Other' },
] as const;

export const AVATAR_COLORS = ['#8b7cf6', '#ec5f9e', '#2fbf8f', '#9d7bd8', '#2fb3d6', '#f5a623', '#ef8f3c', '#e05c5c'];

export const CAT_COLORS: Record<string, string> = {
  general: '#8b7cf6',
  announcements: '#f5a623',
  study: '#2fbf8f',
  life: '#ec5f9e',
  shop: '#ef8f3c',
  sport: '#2fb3d6',
  creative: '#a86ceb',
  other: '#7d8aa5',
  group: '#9d7bd8',
  dm: '#2fb3d6',
};

// ============================================================================
// Pure helpers
// ============================================================================

export function avColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase() || '?';
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Short time for the chat list: HH:MM today, otherwise dd.mm (locale-aware). */
export function formatListTime(ts: number, dateLocale: string): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return formatTime(ts);
  return d.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' });
}

/** Date separator label: Today / Yesterday / "5 October" (locale-aware). */
export function formatDateLabel(
  ts: number,
  t: (key: string) => string,
  dateLocale: string,
): string {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('room.today');
  if (d.toDateString() === yest.toDateString()) return t('room.yesterday');
  return d.toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' });
}

export function uid(prefix = 'm'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Brand color for a room icon (category-based; DMs use the user's color). */
export function roomColor(room: Room): string {
  if (room.roomType === 'group') return CAT_COLORS.group;
  if (room.roomType === 'dm') return avColor(room.dmOtherUserId ?? room.id);
  return CAT_COLORS[room.category ?? 'general'] ?? CAT_COLORS.other;
}

export function safeDataUrl(url: string | undefined, maxLen = 200_000): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  if (!url.startsWith('data:')) return undefined;
  if (!/^data:(image|video|audio)\/(jpeg|png|webp|mp4|webm|quicktime|3gpp|ogg|mpeg|mp3|wav|x-m4a|aac|flac);base64,/.test(url)) return undefined;
  if (url.length > maxLen) return undefined;
  return url;
}

export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, maxLen)
    .trim();
}
