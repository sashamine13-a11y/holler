#!/usr/bin/env python3
"""
Holler migration v3:
  1) Delete legacy "chats" (kind='chat' AND room_type='channel', e.g. General Chat)
  2) Delete existing channels (kind='channel') and all their children
  3) channels.comments_enabled + channel_comments table (post comments) + RLS
  4) Restrict INSERT into messages for channels (owner/admin/global-admin/dev only)
  5) is_dev() helper + dev FOR ALL policies on every table
  6) Grant role='dev' to the site owner (sashamine13@ya.ru)
  7) Add realtime publications entries for messages/rooms/room_members/pins/channel_comments
Idempotent: safe to run twice.
"""
import psycopg2

CONN = dict(
    host='aws-0-eu-west-2.pooler.supabase.com',
    port=6543,
    dbname='postgres',
    user='postgres.favnquxkqqidnfrbxndn',
    password='Holler_19843657',
    sslmode='require',
    connect_timeout=20,
)

OWNER_EMAIL = 'sashamine13@ya.ru'

TABLES = [
    'messages', 'rooms', 'room_members', 'pins', 'polls', 'poll_options',
    'poll_votes', 'anon_questions', 'anon_answers', 'channel_comments',
]


def run(cur, sql, args=None):
    cur.execute(sql, args or ())
    print(f'  ok: {sql[:72]}...'.replace('\n', ' '))


def main():
    conn = psycopg2.connect(**CONN)
    conn.autocommit = False
    cur = conn.cursor()

    # ------------------------------------------------------------------ 1+2
    print('=== 1+2. Delete legacy chats + channels ===')
    cur.execute(
        "SELECT id, name, kind FROM rooms "
        "WHERE kind = 'channel' OR (kind = 'chat' AND room_type = 'channel')"
    )
    doomed = cur.fetchall()
    if doomed:
        ids = [str(r[0]) for r in doomed]
        print('  removing:', [(r[1], r[2]) for r in doomed])
        for sql in [
            "DELETE FROM anon_answers WHERE question_id IN (SELECT id FROM anon_questions WHERE room_id = ANY(%s::uuid[]))",
            "DELETE FROM anon_questions WHERE room_id = ANY(%s::uuid[])",
            "DELETE FROM poll_votes WHERE poll_id IN (SELECT id FROM polls WHERE room_id = ANY(%s::uuid[]))",
            "DELETE FROM poll_options WHERE poll_id IN (SELECT id FROM polls WHERE room_id = ANY(%s::uuid[]))",
            "DELETE FROM polls WHERE room_id = ANY(%s::uuid[])",
            "DELETE FROM pins WHERE room_id = ANY(%s::uuid[])",
            "DELETE FROM messages WHERE room_id = ANY(%s::uuid[])",
            "DELETE FROM room_members WHERE room_id = ANY(%s::uuid[])",
            "DELETE FROM rooms WHERE id = ANY(%s::uuid[])",
        ]:
            run(cur, sql, (ids,))
    else:
        print('  nothing to delete')

    # ------------------------------------------------------------------ 3
    print('=== 3. comments_enabled + channel_comments ===')
    run(cur, "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS comments_enabled boolean NOT NULL DEFAULT true")
    run(cur, """
        CREATE TABLE IF NOT EXISTS channel_comments (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
            author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
            author_name text NOT NULL,
            text text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    run(cur, "CREATE INDEX IF NOT EXISTS idx_channel_comments_message ON channel_comments(message_id, created_at)")
    run(cur, "CREATE INDEX IF NOT EXISTS idx_channel_comments_room ON channel_comments(room_id)")
    run(cur, "ALTER TABLE channel_comments ENABLE ROW LEVEL SECURITY")

    run(cur, "DROP POLICY IF EXISTS \"Authenticated can read channel comments\" ON channel_comments")
    run(cur, "CREATE POLICY \"Authenticated can read channel comments\" ON channel_comments FOR SELECT TO authenticated USING (true)")

    run(cur, "DROP POLICY IF EXISTS \"Users can comment in channels\" ON channel_comments")
    run(cur, """
        CREATE POLICY "Users can comment in channels" ON channel_comments FOR INSERT TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM rooms r
                WHERE r.id = room_id
                  AND (
                      r.comments_enabled = true
                      OR r.created_by = auth.uid()
                      OR EXISTS (SELECT 1 FROM room_members m
                                 WHERE m.room_id = r.id AND m.user_id = auth.uid() AND m.role IN ('admin'))
                      OR EXISTS (SELECT 1 FROM profiles p
                                 WHERE p.id = auth.uid() AND p.role IN ('admin', 'dev'))
                  )
            )
        )
    """)

    run(cur, "DROP POLICY IF EXISTS \"Members can delete comments\" ON channel_comments")
    run(cur, """
        CREATE POLICY "Members can delete comments" ON channel_comments FOR DELETE TO authenticated
        USING (
            author_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM rooms r
                WHERE r.id = room_id
                  AND (
                      r.created_by = auth.uid()
                      OR EXISTS (SELECT 1 FROM room_members m
                                 WHERE m.room_id = r.id AND m.user_id = auth.uid() AND m.role IN ('admin'))
                      OR EXISTS (SELECT 1 FROM profiles p
                                 WHERE p.id = auth.uid() AND p.role IN ('admin', 'dev'))
                  )
            )
        )
    """)

    # ------------------------------------------------------------------ 4
    print('=== 4. Channel posting restriction on messages ===')
    run(cur, "DROP POLICY IF EXISTS \"Authenticated can send messages\" ON messages")
    run(cur, """
        CREATE POLICY "Authenticated can send messages" ON messages FOR INSERT TO authenticated
        WITH CHECK (
            NOT EXISTS (SELECT 1 FROM rooms r WHERE r.id = room_id AND r.kind = 'channel')
            OR EXISTS (SELECT 1 FROM rooms r WHERE r.id = room_id AND r.created_by = auth.uid())
            OR EXISTS (SELECT 1 FROM room_members m
                       WHERE m.room_id = room_id AND m.user_id = auth.uid() AND m.role IN ('admin'))
            OR EXISTS (SELECT 1 FROM profiles p
                       WHERE p.id = auth.uid() AND p.role IN ('admin', 'dev'))
        )
    """)

    # ------------------------------------------------------------------ 5
    print('=== 5. is_dev() + dev full-access policies ===')
    run(cur, """
        CREATE OR REPLACE FUNCTION public.is_dev() RETURNS boolean
        LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
            SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'dev')
        $$
    """)
    for t in TABLES:
        if not t:
            continue
        run(cur, f"DROP POLICY IF EXISTS \"Dev full access\" ON {t}")
        run(cur, f"""
            CREATE POLICY "Dev full access" ON {t} FOR ALL TO authenticated
            USING (public.is_dev()) WITH CHECK (public.is_dev())
        """)

    # ------------------------------------------------------------------ 6
    print('=== 6. Grant dev role to site owner ===')
    run(cur, "ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check")
    run(cur, "ALTER TABLE profiles ADD CONSTRAINT profiles_role_check "
             "CHECK (role = ANY (ARRAY['member'::text, 'admin'::text, 'dev'::text]))")
    cur.execute("UPDATE profiles SET role = 'dev' WHERE email = %s", (OWNER_EMAIL,))
    print(f'  role=dev set for {OWNER_EMAIL}: {cur.rowcount} row(s)')
    if cur.rowcount == 0:
        print('  WARNING: owner profile not found!')

    # ------------------------------------------------------------------ 7
    print('=== 7. Realtime publications ===')
    for pub in ('supabase_realtime', 'supabase_realtime_messages_publication'):
        for t in ('messages', 'rooms', 'room_members', 'pins', 'channel_comments'):
            try:
                cur.execute(
                    "SELECT 1 FROM pg_publication_tables WHERE pubname = %s "
                    "AND schemaname = 'public' AND tablename = %s", (pub, t))
                if cur.fetchone():
                    print(f'  {pub}.{t}: already member')
                else:
                    cur.execute(f'ALTER PUBLICATION {pub} ADD TABLE public.{t}')
                    print(f'  {pub}.{t}: added')
            except Exception as e:  # publication may not exist
                print(f'  {pub}.{t}: SKIPPED ({e.__class__.__name__})')
                conn.rollback()

    conn.commit()

    # ------------------------------------------------------------------ verify
    print('\n=== VERIFY ===')
    cur.execute("SELECT name, kind, room_type FROM rooms ORDER BY created_at")
    print('rooms:', cur.fetchall())
    cur.execute("SELECT email, role FROM profiles WHERE role IN ('admin','dev')")
    print('privileged:', cur.fetchall())
    cur.execute("SELECT pubname, tablename FROM pg_publication_tables WHERE schemaname='public' ORDER BY 1,2")
    print('publication tables:', cur.fetchall())
    cur.execute("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='Dev full access'")
    print('dev policies:', cur.fetchone()[0])
    conn.close()
    print('\nDONE')


if __name__ == '__main__':
    main()
