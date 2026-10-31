'use client';

import { supabase } from '@/lib/supabase';

// ============================================================================
// Types — schema v2 (room_type, dm_user1/2, room_members, reply_to, media_url)
// ============================================================================

export interface DbProfile {
  id: string;
  email: string;
  name: string;
  role: 'member' | 'admin' | 'dev';
  avatar: string | null;
  username: string;
  about: string | null;
  secret_question: string | null;
  created_at: string;
}

export interface DbRoom {
  id: string;
  name: string;
  kind: 'channel' | 'chat';
  room_type: 'channel' | 'dm' | 'group';
  category: string | null;
  about: string | null;
  dm_user1: string | null;
  dm_user2: string | null;
  created_by: string | null;
  created_at: string;
  comments_enabled: boolean;
}

export interface DbMessage {
  id: string;
  room_id: string;
  author_id: string | null;
  author_name: string;
  author_role: string | null;
  text: string | null;
  image: string | null;
  media_type: 'image' | 'video' | 'audio' | null;
  media_url: string | null;
  reply_to: string | null;
  forwarded_from: string | null;
  forwarded_by: string | null;
  deleted_at: string | null;
  edited_at: string | null;
  is_anonymous: boolean;
  created_at: string;
}

export interface DbRoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: 'member' | 'admin';
  joined_at: string;
}

// ============================================================================
// API helpers — RLS-protected, run under the authenticated user's JWT
// ============================================================================

/**
 * Load rooms visible to the user:
 *  - all channels (room_type='channel')
 *  - DMs where the user is dm_user1 or dm_user2
 *  - groups where the user has a room_members row
 */
export async function loadRooms(myUserId: string): Promise<{ rooms: DbRoom[]; memberships: DbRoomMember[] }> {
  const [roomsRes, membershipsRes] = await Promise.all([
    supabase.from('rooms').select('*').order('created_at', { ascending: true }),
    supabase.from('room_members').select('*').eq('user_id', myUserId),
  ]);

  if (roomsRes.error) {
    console.warn('[api] loadRooms error:', roomsRes.error.message);
    return { rooms: [], memberships: [] };
  }
  const memberships = (membershipsRes.data ?? []) as DbRoomMember[];
  const myRoomIds = new Set(memberships.map(m => m.room_id));

  const all = (roomsRes.data ?? []) as DbRoom[];
  const visible = all.filter(r => {
    if (r.room_type === 'dm') return r.dm_user1 === myUserId || r.dm_user2 === myUserId;
    if (r.room_type === 'group') return myRoomIds.has(r.id);
    return true; // channels visible to everyone
  });

  return { rooms: visible, memberships };
}

/** Load messages for a room, oldest first (soft-deleted excluded). */
export async function loadMessages(roomId: string): Promise<DbMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    console.warn('[api] loadMessages error:', error.message);
    return [];
  }
  return (data ?? []) as DbMessage[];
}

/** Load all profiles (for member list + DM creation + group creation). */
export async function loadProfiles(): Promise<DbProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('name', { ascending: true });
  if (error) {
    console.warn('[api] loadProfiles error:', error.message);
    return [];
  }
  return (data ?? []) as DbProfile[];
}

export interface RoomPreview {
  roomId: string;
  authorName: string;
  text: string;
  mediaType: 'image' | 'video' | 'audio' | null;
  isAnonymous: boolean;
  ts: number;
}

/**
 * Load the latest message per room (for the chat-list previews).
 * One lightweight query, newest first, then first occurrence per room.
 */
export async function loadRoomPreviews(): Promise<RoomPreview[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('room_id, author_name, text, media_type, is_anonymous, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    console.warn('[api] loadRoomPreviews error:', error.message);
    return [];
  }
  const seen = new Set<string>();
  const out: RoomPreview[] = [];
  for (const raw of (data ?? []) as Array<{
    room_id: string; author_name: string; text: string | null;
    media_type: 'image' | 'video' | 'audio' | null;
    is_anonymous: boolean; created_at: string;
  }>) {
    if (seen.has(raw.room_id)) continue;
    seen.add(raw.room_id);
    out.push({
      roomId: raw.room_id,
      authorName: raw.author_name,
      text: raw.text ?? '',
      mediaType: raw.media_type,
      isAnonymous: raw.is_anonymous,
      ts: new Date(raw.created_at).getTime(),
    });
  }
  return out;
}

export interface InsertMessageArgs {
  room_id: string;
  author_id: string;
  author_name: string;
  author_role: string | null;
  text: string | null;
  image?: string | null;
  media_type?: 'image' | 'video' | 'audio' | null;
  media_url?: string | null;
  reply_to?: string | null;
  forwarded_from?: string | null;
  forwarded_by?: string | null;
  is_anonymous?: boolean;
}

/** Insert a new message with real reply/forward/media columns. */
export async function insertMessage(msg: InsertMessageArgs): Promise<DbMessage | null> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      room_id: msg.room_id,
      author_id: msg.author_id,
      author_name: msg.author_name,
      author_role: msg.author_role,
      text: msg.text,
      image: msg.image ?? null,
      media_type: msg.media_type ?? null,
      media_url: msg.media_url ?? null,
      reply_to: msg.reply_to ?? null,
      forwarded_from: msg.forwarded_from ?? null,
      forwarded_by: msg.forwarded_by ?? null,
      is_anonymous: msg.is_anonymous ?? false,
    })
    .select()
    .single();
  if (error) {
    console.warn('[api] insertMessage error:', error.message);
    return null;
  }
  return data as DbMessage;
}

/** Soft-delete a message (sets deleted_at; RLS allows author only). */
export async function softDeleteMessage(msgId: string): Promise<boolean> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', msgId);
  if (error) {
    console.warn('[api] softDeleteMessage error:', error.message);
    return false;
  }
  return true;
}

/** Edit message text (RLS: author only; sets edited_at). */
export async function editMessage(msgId: string, newText: string): Promise<boolean> {
  const { error } = await supabase
    .from('messages')
    .update({ text: newText, edited_at: new Date().toISOString() })
    .eq('id', msgId);
  if (error) {
    console.warn('[api] editMessage error:', error.message);
    return false;
  }
  return true;
}

/** Create or find a DM room via the get_or_create_dm RPC. */
export async function findOrCreateDm(
  myUserId: string,
  otherUserId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_or_create_dm', {
    user1: myUserId,
    user2: otherUserId,
  });
  if (error) {
    console.warn('[api] get_or_create_dm error:', error.message);
    return null;
  }
  return data as string;
}

/** Load a room by id. */
export async function loadRoom(roomId: string): Promise<DbRoom | null> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle();
  if (error || !data) return null;
  return data as DbRoom;
}

/** Create a group chat: insert room (room_type='group') + room_members rows. */
export async function createGroup(
  name: string,
  memberIds: string[],
  creatorId: string,
): Promise<DbRoom | null> {
  // Insert the room; the on_room_created trigger adds the creator as admin member
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .insert({
      name: name.slice(0, 64),
      kind: 'chat',
      room_type: 'group',
      category: 'group',
      created_by: creatorId,
    })
    .select()
    .single();
  if (roomErr || !room) {
    console.warn('[api] createGroup room insert error:', roomErr?.message);
    return null;
  }

  // Add the other members
  const others = memberIds.filter(id => id !== creatorId);
  if (others.length > 0) {
    const { error: memErr } = await supabase
      .from('room_members')
      .insert(others.map(uid => ({ room_id: room.id, user_id: uid, role: 'member' })));
    if (memErr) {
      console.warn('[api] createGroup members insert error:', memErr.message);
      // Room exists but some members may be missing; still return the room
    }
  }
  return room as DbRoom;
}

export interface RoomMemberWithProfile extends DbRoomMember {
  profile: DbProfile | null;
}

/** Load room members with profile info (for group member management). */
export async function loadRoomMembers(roomId: string): Promise<RoomMemberWithProfile[]> {
  const { data, error } = await supabase
    .from('room_members')
    .select('*, profile:profiles(*)')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });
  if (error) {
    console.warn('[api] loadRoomMembers error:', error.message);
    return [];
  }
  return (data ?? []) as unknown as RoomMemberWithProfile[];
}

// ============================================================================
// Room settings (rename / about / category) — RLS allows authenticated UPDATE
// ============================================================================

export interface RoomPatch {
  name?: string;
  about?: string | null;
  category?: string | null;
  comments_enabled?: boolean;
}

/** Persist room settings; returns the updated row or null on failure. */
export async function updateRoom(roomId: string, patch: RoomPatch): Promise<DbRoom | null> {
  const { data, error } = await supabase
    .from('rooms')
    .update(patch)
    .eq('id', roomId)
    .select()
    .single();
  if (error) {
    console.warn('[api] updateRoom error:', error.message);
    return null;
  }
  return data as DbRoom;
}

/**
 * Add members to a group (RLS: room creator or group admin; self-join allowed).
 */
export async function addRoomMembers(roomId: string, userIds: string[]): Promise<boolean> {
  if (userIds.length === 0) return true;
  const { error } = await supabase
    .from('room_members')
    .insert(userIds.map(uid => ({ room_id: roomId, user_id: uid, role: 'member' })));
  if (error) {
    console.warn('[api] addRoomMembers error:', error.message);
    return false;
  }
  return true;
}

/** Remove a member (RLS: self-leave or group admin). */
export async function removeRoomMember(roomId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);
  if (error) {
    console.warn('[api] removeRoomMember error:', error.message);
    return false;
  }
  return true;
}

// ============================================================================
// Pins
// ============================================================================

export interface DbPin {
  messageId: string | null;
  text: string;
  ts: number;
}

/**
 * Pin a specific message in a room. Replaces any existing pin for that room
 * (one pin per room). Uses the message_id column introduced in v2.1.
 */
export async function pinMessageDb(
  roomId: string,
  messageId: string,
  text: string,
  userId: string,
): Promise<boolean> {
  // Delete any existing pin for this room (one pin per room)
  await supabase.from('pins').delete().eq('room_id', roomId);
  const { error } = await supabase
    .from('pins')
    .insert({
      room_id: roomId,
      message_id: messageId,
      text,
      created_by: userId,
    });
  if (error) {
    console.warn('[api] pinMessageDb error:', error.message);
    return false;
  }
  return true;
}

/** Load the pinned message for a room, if any. */
export async function loadPin(roomId: string): Promise<DbPin | null> {
  const { data, error } = await supabase
    .from('pins')
    .select('message_id, text, created_at')
    .eq('room_id', roomId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    messageId: data.message_id ?? null,
    text: data.text,
    ts: new Date(data.created_at).getTime(),
  };
}

export async function unpinDb(roomId: string): Promise<boolean> {
  const { error } = await supabase.from('pins').delete().eq('room_id', roomId);
  return !error;
}

// ============================================================================
// Channel comments — discussion threads under channel posts
// ============================================================================

export interface ChannelComment {
  id: string;
  message_id: string;
  room_id: string;
  author_id: string | null;
  author_name: string;
  text: string;
  created_at: string;
}

/** Load all comments for a room, oldest first. */
export async function loadChannelComments(roomId: string): Promise<ChannelComment[]> {
  const { data, error } = await supabase
    .from('channel_comments')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) {
    console.warn('[api] loadChannelComments error:', error.message);
    return [];
  }
  return (data ?? []) as ChannelComment[];
}

/** Add a comment to a channel post. */
export async function insertChannelComment(
  messageId: string,
  roomId: string,
  authorId: string,
  authorName: string,
  text: string,
): Promise<ChannelComment | null> {
  const { data, error } = await supabase
    .from('channel_comments')
    .insert({ message_id: messageId, room_id: roomId, author_id: authorId, author_name: authorName, text })
    .select()
    .single();
  if (error) {
    console.warn('[api] insertChannelComment error:', error.message);
    return null;
  }
  return data as ChannelComment;
}

/** Delete a comment (own / channel admin / dev — enforced by RLS). */
export async function deleteChannelComment(commentId: string): Promise<boolean> {
  const { error } = await supabase
    .from('channel_comments')
    .delete()
    .eq('id', commentId);
  if (error) {
    console.warn('[api] deleteChannelComment error:', error.message);
    return false;
  }
  return true;
}

// ============================================================================
// Realtime subscriptions
// ============================================================================

export function subscribeToRoomMessages(
  roomId: string,
  onInsert: (msg: DbMessage) => void,
  onUpdate: (msg: DbMessage) => void,
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
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      (payload) => onUpdate(payload.new as DbMessage),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export function subscribeToRooms(onChange: () => void): () => void {
  const channel = supabase
    .channel('rooms:all')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members' }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export function subscribeToPin(roomId: string, onChange: () => void): () => void {
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

export function subscribeToRoomComments(
  roomId: string,
  onInsert: (c: ChannelComment) => void,
  onDelete: (id: string) => void,
): () => void {
  const channel = supabase
    .channel(`comments:${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'channel_comments', filter: `room_id=eq.${roomId}` },
      (payload) => onInsert(payload.new as ChannelComment),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'channel_comments', filter: `room_id=eq.${roomId}` },
      (payload) => onDelete((payload.old as { id: string }).id),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
