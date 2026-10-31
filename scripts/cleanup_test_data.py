#!/usr/bin/env python3
"""
Holler cleanup: delete all test users and test rooms before release.

Keeps:
  - sashamine13@ya.ru (site owner, dev role)
  - holler1793305656@maxxspace.com (first real user, if desired)

Deletes:
  - All profiles with email ending @holler-test.example
  - All rooms with test names (RLS test group *, Dev Channel)
  - Cascade: messages, room_members, pins, polls, channel_comments,
    anon_questions/answers, poll_votes/options for those rooms
  - Corresponding auth.users entries (test accounts)
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

# ------------------------------------------------------------------ find test data
print('=== Test profiles (to delete) ===')
cur.execute("""
    SELECT id, email, name, role FROM public.profiles
    WHERE email LIKE '%@holler-test.example'
    ORDER BY created_at
""")
test_profiles = cur.fetchall()
test_user_ids = [str(r[0]) for r in test_profiles]
for r in test_profiles:
    print(f'  {r[1]:50s} role={r[3]:8s} name={r[2]}')
print(f'  total: {len(test_profiles)}')

print('\n=== Real profiles (to keep) ===')
cur.execute("""
    SELECT id, email, name, role FROM public.profiles
    WHERE email NOT LIKE '%@holler-test.example'
    ORDER BY created_at
""")
for r in cur.fetchall():
    print(f'  {r[1]:50s} role={r[3]:8s} name={r[2]}')

print('\n=== All rooms ===')
cur.execute("SELECT id, name, kind, room_type, created_by FROM public.rooms ORDER BY created_at")
all_rooms = cur.fetchall()
test_room_ids = []
for r in all_rooms:
    is_test = ('RLS test group' in r[1]) or ('Dev Channel' in r[1]) or (str(r[4]) in test_user_ids)
    tag = ' [TEST-DELETE]' if is_test else ' [KEEP]'
    if is_test:
        test_room_ids.append(str(r[0]))
    print(f'  {r[1]:40s} kind={r[2]} type={r[3]}{tag}')

print(f'\n  test rooms to delete: {len(test_room_ids)}')

# ------------------------------------------------------------------ delete room children + rooms
if test_room_ids:
    print('\n=== Deleting test rooms (cascade children) ===')
    for sql in [
        "DELETE FROM anon_answers WHERE question_id IN (SELECT id FROM anon_questions WHERE room_id = ANY(%s::uuid[]))",
        "DELETE FROM anon_questions WHERE room_id = ANY(%s::uuid[])",
        "DELETE FROM poll_votes WHERE poll_id IN (SELECT id FROM polls WHERE room_id = ANY(%s::uuid[]))",
        "DELETE FROM poll_options WHERE poll_id IN (SELECT id FROM polls WHERE room_id = ANY(%s::uuid[]))",
        "DELETE FROM polls WHERE room_id = ANY(%s::uuid[])",
        "DELETE FROM pins WHERE room_id = ANY(%s::uuid[])",
        "DELETE FROM channel_comments WHERE room_id = ANY(%s::uuid[])",
        "DELETE FROM channel_comments WHERE message_id IN (SELECT id FROM messages WHERE room_id = ANY(%s::uuid[]))",
        "DELETE FROM messages WHERE room_id = ANY(%s::uuid[])",
        "DELETE FROM room_members WHERE room_id = ANY(%s::uuid[])",
        "DELETE FROM rooms WHERE id = ANY(%s::uuid[])",
    ]:
        cur.execute(sql, (test_room_ids,))
        if cur.rowcount > 0:
            print(f'  {cur.rowcount} row(s): {sql[:60]}...')

# ------------------------------------------------------------------ delete test profiles + auth.users
if test_user_ids:
    print('\n=== Deleting test auth.users entries ===')
    cur.execute("DELETE FROM auth.users WHERE id = ANY(%s::uuid[])", (test_user_ids,))
    print(f'  auth.users deleted: {cur.rowcount}')

    print('=== Deleting test profiles ===')
    cur.execute("DELETE FROM public.profiles WHERE id = ANY(%s::uuid[])", (test_user_ids,))
    print(f'  profiles deleted: {cur.rowcount}')

    # Clean up any DM rooms between test users (dm_user1/dm_user2)
    print('=== Deleting orphaned DM rooms (referencing deleted users) ===')
    cur.execute("""
        DELETE FROM messages WHERE room_id IN (
            SELECT id FROM rooms WHERE room_type = 'dm'
            AND (dm_user1 = ANY(%s::uuid[]) OR dm_user2 = ANY(%s::uuid[]))
        )
    """, (test_user_ids, test_user_ids))
    print(f'  messages in DMs: {cur.rowcount}')
    cur.execute("""
        DELETE FROM room_members WHERE room_id IN (
            SELECT id FROM rooms WHERE room_type = 'dm'
            AND (dm_user1 = ANY(%s::uuid[]) OR dm_user2 = ANY(%s::uuid[]))
        )
    """, (test_user_ids, test_user_ids))
    cur.execute("""
        DELETE FROM rooms WHERE room_type = 'dm'
        AND (dm_user1 = ANY(%s::uuid[]) OR dm_user2 = ANY(%s::uuid[]))
    """, (test_user_ids, test_user_ids))
    print(f'  DM rooms deleted: {cur.rowcount}')

conn.commit()

# ------------------------------------------------------------------ verify
print('\n=== VERIFY: remaining profiles ===')
cur.execute("SELECT email, name, role, username FROM public.profiles ORDER BY created_at")
for r in cur.fetchall():
    print(f'  {r[0]:50s} @{r[3]:30s} role={r[2]} name={r[1]}')

print('\n=== VERIFY: remaining rooms ===')
cur.execute("SELECT name, kind, room_type FROM public.rooms ORDER BY created_at")
remaining = cur.fetchall()
if remaining:
    for r in remaining:
        print(f'  {r[0]} ({r[1]}/{r[2]})')
else:
    print('  (none)')

print('\n=== VERIFY: remaining room_members ===')
cur.execute("SELECT count(*) FROM public.room_members")
print(f'  total: {cur.fetchone()[0]}')

conn.close()
print('\nDONE')
