'use client';

import { supabase } from '@/lib/supabase';

// ============================================================================
// Types — match DB schema (schema.sql, no v2)
// ============================================================================

export interface DbProfile {
  id: string;
  email: string;
  name: string;
  role: 'member' | 'admin';
  avatar: string | null;
  secret_question: string | null;
  created_at: string;
}

export interface DbRoom {
  id: string;
  name: string;
  kind: 'channel' | 'chat';
  category: string | null;
  about: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DbMessage {
  id: string;
  room_id: string;
  author_id: string | null;
  author_name: string;
  author_role: string | null;
  text: string | null;
  image: string | null;
  is_anonymous: boolean;
  created_at: string;
}

// ============================================================================
// DM / Group encoding helpers
// ----------------------------------------------------------------------------
// Schema v1 doesn't have room_type/dm_user1/dm_user2 columns.
// We encode DM and group metadata in the existing `category` and `about` fields:
//   DM:    category = 'dm',           about = JSON.stringify({ u1, u2 })  (sorted UUIDs)
//   Group: category = 'group',        about = JSON.stringify({ members: [uuid, ...], createdBy })
//   Channel/Chat keep their original category values (announcements, study, ...)
// ============================================================================

export interface DmMeta { u1: string; u2: string; }
export interface GroupMeta { members: string[]; createdBy?: string; }

/** Sort two UUIDs so DM room is found deterministically regardless of order. */
function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Build deterministic DM metadata string for `rooms.about`. */
export function encodeDmMeta(userA: string, userB: string): string {
  const [u1, u2] = sortPair(userA, userB);
  return JSON.stringify({ u1, u2 } satisfies DmMeta);
}

/** Parse DM metadata from rooms.about; returns null if not a DM or malformed. */
export function decodeDmMeta(about: string | null): DmMeta | null {
  if (!about) return null;
  try {
    const m = JSON.parse(about) as DmMeta;
    if (typeof m.u1 === 'string' && typeof m.u2 === 'string') return m;
    return null;
  } catch { return null; }
}

/** Parse group metadata; returns null if not a group or malformed. */
export function decodeGroupMeta(about: string | null): GroupMeta | null {
  if (!about) return null;
  try {
    const m = JSON.parse(about) as GroupMeta;
    if (Array.isArray(m.members)) return m;
    return null;
  } catch { return null; }
}

/** Check if a room is a DM and the given user is a participant. */
export function isDmForUser(room: DbRoom, userId: string): boolean {
  if (room.category !== 'dm') return false;
  const m = decodeDmMeta(room.about);
  return m !== null && (m.u1 === userId || m.u2 === userId);
}

/** Get the "other" user ID in a DM room (not the current user). */
export function dmOtherUserId(room: DbRoom, myId: string): string | null {
  const m = decodeDmMeta(room.about);
  if (!m) return null;
  if (m.u1 === myId) return m.u2;
  if (m.u2 === myId) return m.u1;
  return null;
}

/** Check if a room is a group and the user is a member. */
export function isGroupForUser(room: DbRoom, userId: string): boolean {
  if (room.category !== 'group') return false;
  const m = decodeGroupMeta(room.about);
  return m !== null && m.members.includes(userId);
}

// ============================================================================
// Reply / Forward encoding in message text
// ----------------------------------------------------------------------------
// Schema v1 messages table has no reply_to / forwarded_from columns.
// We encode reply and forward as a JSON prefix at the start of `text`:
//   {"reply":"<uuid>","snippet":"<text>"}\n<actual message text>
//   {"fwd":"<fromName>","snippet":"<text>"}\n<actual message text>
// Parser extracts the prefix and returns { kind, ref, snippet, body }.
// ============================================================================

export interface MsgMeta {
  reply?: { msgId: string; snippet: string };
  fwd?: { fromName: string; snippet: string };
  body: string;
}

const META_PREFIX = '{"holler:meta":';
const META_PREFIX_LEN = META_PREFIX.length;

/** Encode reply/forward metadata + body into a single text field. */
export function encodeMsgText(body: string, meta?: Pick<MsgMeta, 'reply' | 'fwd'>): string {
  if (!meta || (!meta.reply && !meta.fwd)) return body;
  const metaObj: Record<string, unknown> = { 'holler:meta': true };
  if (meta.reply) metaObj.reply = meta.reply;
  if (meta.fwd) metaObj.fwd = meta.fwd;
  return JSON.stringify(metaObj) + '\n' + body;
}

/** Parse a stored text field back into { reply?, fwd?, body }. */
export function parseMsgText(raw: string | null | undefined): MsgMeta {
  const empty: MsgMeta = { body: raw ?? '' };
  if (!raw || !raw.startsWith(META_PREFIX)) return empty;
  const nl = raw.indexOf('\n');
  if (nl < 0) return empty;
  try {
    const obj = JSON.parse(raw.slice(0, nl)) as { 'holler:meta'?: true; reply?: MsgMeta['reply']; fwd?: MsgMeta['fwd'] };
    if (!obj['holler:meta']) return empty;
    return {
      reply: obj.reply,
      fwd: obj.fwd,
      body: raw.slice(nl + 1),
    };
  } catch { return empty; }
}

// ============================================================================
// API helpers — all use supabase client with anon key (RLS-protected)
// ============================================================================

/** Load all rooms visible to the user (channels + their DMs + their groups). */
export async function loadRooms(myUserId: string): Promise<DbRoom[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[api] loadRooms error:', error.message);
    return [];
  }
  // Filter: keep all channels/chats (kind='channel' or kind='chat' with non-dm/group category),
  // but for DM and group rooms only keep those where the user is a participant.
  return (data ?? []).filter((r: DbRoom) => {
    if (r.category === 'dm') return isDmForUser(r, myUserId);
    if (r.category === 'group') return isGroupForUser(r, myUserId);
    return true;
  });
}

/** Load messages for a room, oldest first. */
export async function loadMessages(roomId: string): Promise<DbMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    console.warn('[api] loadMessages error:', error.message);
    return [];
  }
  return data ?? [];
}

/** Load all profiles (for member list + DM creation). */
export async function loadProfiles(): Promise<DbProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('name', { ascending: true });
  if (error) {
    console.warn('[api] loadProfiles error:', error.message);
    return [];
  }
  return data ?? [];
}

/** Insert a new message. Returns the inserted row or null on error. */
export async function insertMessage(
  msg: Omit<DbMessage, 'id' | 'created_at'>,
): Promise<DbMessage | null> {
  const { data, error } = await supabase
    .from('messages')
    .insert(msg)
    .select()
    .single();
  if (error) {
    console.warn('[api] insertMessage error:', error.message);
    return null;
  }
  return data;
}

/** Soft-delete by emptying text + image (we have no UPDATE policy in v1 schema,
 *  so this only works for the message author via the DELETE policy... but DELETE
 *  loses the row entirely. As a workaround, we DELETE the row). */
export async function deleteMessage(msgId: string): Promise<boolean> {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', msgId);
  if (error) {
    console.warn('[api] deleteMessage error:', error.message);
    return false;
  }
  return true;
}

/** Create or find a DM room between the current user and another user. */
export async function findOrCreateDm(
  myUserId: string,
  otherUserId: string,
  otherUserName: string,
  myName: string,
): Promise<DbRoom | null> {
  // Try to find existing DM
  const { data: existing } = await supabase
    .from('rooms')
    .select('*')
    .eq('category', 'dm')
    .order('created_at', { ascending: true });

  if (existing) {
    for (const r of existing as DbRoom[]) {
      const m = decodeDmMeta(r.about);
      if (!m) continue;
      if ((m.u1 === myUserId && m.u2 === otherUserId) ||
          (m.u1 === otherUserId && m.u2 === myUserId)) {
        return r;
      }
    }
  }

  // Create new DM room
  const about = encodeDmMeta(myUserId, otherUserId);
  const name = `${myName} & ${otherUserName}`;
  const { data, error } = await supabase
    .from('rooms')
    .insert({
      name,
      kind: 'chat',
      category: 'dm',
      about,
      created_by: myUserId,
    })
    .select()
    .single();
  if (error) {
    console.warn('[api] findOrCreateDm insert error:', error.message);
    return null;
  }
  return data;
}

/** Create a group chat with the given members. */
export async function createGroup(
  name: string,
  memberIds: string[],
  creatorId: string,
): Promise<DbRoom | null> {
  const members = Array.from(new Set([creatorId, ...memberIds]));
  const about = JSON.stringify({ members, createdBy: creatorId } satisfies GroupMeta);
  const { data, error } = await supabase
    .from('rooms')
    .insert({
      name: name.slice(0, 64),
      kind: 'chat',
      category: 'group',
      about,
      created_by: creatorId,
    })
    .select()
    .single();
  if (error) {
    console.warn('[api] createGroup insert error:', error.message);
    return null;
  }
  return data;
}

/** Insert a pin for a room. */
export async function pinMessageDb(roomId: string, text: string, userId: string): Promise<boolean> {
  // Delete any existing pin for this room first (unique constraint on room_id)
  await supabase.from('pins').delete().eq('room_id', roomId);
  const { error } = await supabase
    .from('pins')
    .insert({ room_id: roomId, text, created_by: userId });
  if (error) {
    console.warn('[api] pinMessageDb error:', error.message);
    return false;
  }
  return true;
}

/** Load the current pin for a room. */
export async function loadPin(roomId: string): Promise<{ text: string; ts: number } | null> {
  const { data, error } = await supabase
    .from('pins')
    .select('text, created_at')
    .eq('room_id', roomId)
    .maybeSingle();
  if (error || !data) return null;
  return { text: data.text, ts: new Date(data.created_at).getTime() };
}

/** Remove the pin for a room. */
export async function unpinDb(roomId: string): Promise<boolean> {
  const { error } = await supabase.from('pins').delete().eq('room_id', roomId);
  return !error;
}

// ============================================================================
// Realtime — subscribe to message inserts in a room
// ============================================================================

/** Subscribe to INSERT events on messages for the given room. */
export function subscribeToRoomMessages(
  roomId: string,
  onInsert: (msg: DbMessage) => void,
  onDelete: (msgId: string) => void,
): () => void {
  const channel = supabase
    .channel(`messages:${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      (payload) => onInsert(payload.new as DbMessage),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      (payload) => onDelete((payload.old as DbMessage).id),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/** Subscribe to room list changes (new rooms, deleted rooms). */
export function subscribeToRooms(
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel('rooms:all')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms' },
      () => onChange(),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/** Subscribe to pin changes for a room. */
export function subscribeToPin(
  roomId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`pin:${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pins', filter: `room_id=eq.${roomId}` },
      () => onChange(),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
