#!/usr/bin/env python3
"""
Holler migration v7:
  1) channel_subscriptions table — users subscribe to channels (opt-in visibility)
  2) message_reactions table — emoji reactions on messages
  3) RLS policies for both
  4) Realtime publications
Idempotent.
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

conn = psycopg2.connect(**CONN)
conn.autocommit = False
cur = conn.cursor()


def run(sql, args=None):
    cur.execute(sql, args or [])
    print(f'  ok: {sql[:80].replace(chr(10)," ")}...')


# ------------------------------------------------------------------ 1. channel_subscriptions
print('=== 1. channel_subscriptions ===')
run("""
    CREATE TABLE IF NOT EXISTS public.channel_subscriptions (
        user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, room_id)
    )
""")
run("CREATE INDEX IF NOT EXISTS idx_channel_subs_room ON public.channel_subscriptions(room_id)")
run("ALTER TABLE public.channel_subscriptions ENABLE ROW LEVEL SECURITY")

# policies
run("DROP POLICY IF EXISTS \"Users read their subscriptions\" ON public.channel_subscriptions")
run("""CREATE POLICY "Users read their subscriptions" ON public.channel_subscriptions
    FOR SELECT TO authenticated USING (user_id = auth.uid())""")

run("DROP POLICY IF EXISTS \"Users subscribe to channels\" ON public.channel_subscriptions")
run("""CREATE POLICY "Users subscribe to channels" ON public.channel_subscriptions
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())""")

run("DROP POLICY IF EXISTS \"Users unsubscribe\" ON public.channel_subscriptions")
run("""CREATE POLICY "Users unsubscribe" ON public.channel_subscriptions
    FOR DELETE TO authenticated USING (user_id = auth.uid())""")

run("DROP POLICY IF EXISTS \"Dev full access\" ON public.channel_subscriptions")
run("""CREATE POLICY "Dev full access" ON public.channel_subscriptions
    FOR ALL TO authenticated USING (public.is_dev()) WITH CHECK (public.is_dev())""")

# ------------------------------------------------------------------ 2. message_reactions
print('=== 2. message_reactions ===')
run("""
    CREATE TABLE IF NOT EXISTS public.message_reactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
        room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        emoji text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (message_id, user_id, emoji)
    )
""")
run("CREATE INDEX IF NOT EXISTS idx_reactions_message ON public.message_reactions(message_id)")
run("CREATE INDEX IF NOT EXISTS idx_reactions_room ON public.message_reactions(room_id)")
run("ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY")

run("DROP POLICY IF EXISTS \"Authenticated can read reactions\" ON public.message_reactions")
run("""CREATE POLICY "Authenticated can read reactions" ON public.message_reactions
    FOR SELECT TO authenticated USING (true)""")

run("DROP POLICY IF EXISTS \"Users add their own reaction\" ON public.message_reactions")
run("""CREATE POLICY "Users add their own reaction" ON public.message_reactions
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid())""")

run("DROP POLICY IF EXISTS \"Users remove their own reaction\" ON public.message_reactions")
run("""CREATE POLICY "Users remove their own reaction" ON public.message_reactions
    FOR DELETE TO authenticated USING (user_id = auth.uid())""")

run("DROP POLICY IF EXISTS \"Dev full access\" ON public.message_reactions")
run("""CREATE POLICY "Dev full access" ON public.message_reactions
    FOR ALL TO authenticated USING (public.is_dev()) WITH CHECK (public.is_dev())""")

# ------------------------------------------------------------------ 3. realtime
print('=== 3. Realtime publications ===')
for pub in ('supabase_realtime',):
    for t in ('channel_subscriptions', 'message_reactions'):
        try:
            cur.execute(
                "SELECT 1 FROM pg_publication_tables WHERE pubname=%s AND schemaname='public' AND tablename=%s",
                (pub, t))
            if cur.fetchone():
                print(f'  {pub}.{t}: already member')
            else:
                cur.execute(f'ALTER PUBLICATION {pub} ADD TABLE public.{t}')
                print(f'  {pub}.{t}: added')
        except Exception as e:
            print(f'  {pub}.{t}: SKIPPED ({e.__class__.__name__})')
            conn.rollback()

conn.commit()

# ------------------------------------------------------------------ verify
print('\n=== VERIFY ===')
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('channel_subscriptions','message_reactions')")
print('tables:', cur.fetchall())
cur.execute("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('channel_subscriptions','message_reactions')")
print('policies:', cur.fetchone()[0])
conn.close()
print('\nDONE')
