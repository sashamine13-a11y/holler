#!/usr/bin/env python3
"""
Room member management RLS:
- group admins / room creators can add members
- group admins / room creators can remove members
- everyone can still leave (self-delete)
- DM creation via get_or_create_dm is SECURITY DEFINER (unaffected)
Single-statement execution with individual commit/rollback.
"""
import psycopg2

CONN = dict(
    host='aws-0-eu-west-2.pooler.supabase.com',
    port=6543,
    dbname='postgres',
    user='postgres.favnquxkqqidnfrbxndn',
    password='Holler_19843657',
    sslmode='require',
    connect_timeout=15,
)

STATEMENTS = [
    # Remove old permissive policies
    """DROP POLICY IF EXISTS "Members can leave rooms" ON public.room_members""",
    """DROP POLICY IF EXISTS "Authenticated can join rooms" ON public.room_members""",
    # INSERT: creator of the room, admin member of the room, or self-join
    """
    CREATE POLICY "Room admins manage members insert"
    ON public.room_members FOR INSERT
    TO authenticated
    WITH CHECK (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.id = room_members.room_id
          AND r.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.room_members a
        WHERE a.room_id = room_members.room_id
          AND a.user_id = auth.uid()
          AND a.role = 'admin'
      )
    )
    """,
    # DELETE: self-leave, group admin, or room creator
    """
    CREATE POLICY "Room admins manage members delete"
    ON public.room_members FOR DELETE
    TO authenticated
    USING (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.id = room_members.room_id
          AND r.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.room_members a
        WHERE a.room_id = room_members.room_id
          AND a.user_id = auth.uid()
          AND a.role = 'admin'
      )
    )
    """,
]

def main():
    conn = psycopg2.connect(**CONN)
    conn.autocommit = False
    cur = conn.cursor()
    ok = True
    for sql in STATEMENTS:
        label = ' '.join(sql.split())[:80]
        try:
            cur.execute(sql)
            conn.commit()
            print(f'OK   {label}')
        except Exception as e:
            conn.rollback()
            ok = False
            print(f'FAIL {label}\n     {e}')
    # verify
    try:
        cur.execute("""
            SELECT policyname, cmd FROM pg_policies
            WHERE schemaname='public' AND tablename='room_members'
            ORDER BY policyname
        """)
        conn.commit()
        print('\nroom_members policies now:')
        for name, cmd in cur.fetchall():
            print(f'  [{cmd}] {name}')
    except Exception as e:
        conn.rollback()
        print('verify failed:', e)
    conn.close()
    print('\nDONE' if ok else '\nFINISHED WITH ERRORS')

if __name__ == '__main__':
    main()
