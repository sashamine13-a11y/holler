"""Check auth settings and add necessary RLS policies."""
import psycopg2

CONN = dict(
    host="aws-0-eu-west-2.pooler.supabase.com",
    port=6543,
    user="postgres.favnquxkqqidnfrbxndn",
    password="Holler_19843657",
    dbname="postgres",
    connect_timeout=15,
    sslmode="require",
)

conn = psycopg2.connect(**CONN)
cur = conn.cursor()

# Check auth.users count and recent signups
print("=== auth.users count ===")
cur.execute("select count(*) from auth.users")
print(f"  total users: {cur.fetchone()[0]}")

print("\n=== recent users (id, email, created_at, confirmed_at) ===")
cur.execute("""
    select id, email, created_at, email_confirmed_at, last_sign_in_at
    from auth.users order by created_at desc limit 10
""")
for r in cur.fetchall():
    print(f"  {r}")

# Check the auth config for email confirmation
print("\n=== auth config ===")
cur.execute("""
    select id, config from auth.config limit 1
""")
row = cur.fetchone()
if row:
    config = row[1] if isinstance(row[1], dict) else dict(row[1])
    keys_of_interest = [
        'mailer_autoconfirm', 'sms_autoconfirm', 'enable_signup',
        'enable_anonymous_signins', 'disable_signup'
    ]
    for k in keys_of_interest:
        print(f"  {k}: {config.get(k)}")
    # Show all keys briefly
    print(f"  (all keys: {sorted(config.keys())[:20]})")

# Check profiles count
print("\n=== profiles count ===")
cur.execute("select count(*) from public.profiles")
print(f"  total profiles: {cur.fetchone()[0]}")

cur.close()
conn.close()
