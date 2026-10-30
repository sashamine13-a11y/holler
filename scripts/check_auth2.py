"""Check auth schema and apply RLS fixes + auto-confirm trigger."""
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

# List auth schema tables
print("=== auth schema tables ===")
cur.execute("""
    select table_name from information_schema.tables
    where table_schema='auth' order by table_name
""")
for (t,) in cur.fetchall():
    print(f"  - {t}")

# Try to read auth.config
print("\n=== try auth.config ===")
try:
    cur.execute("select * from auth.config")
    cols = [d[0] for d in cur.description]
    row = cur.fetchone()
    if row:
        # Show only relevant keys
        for c, v in zip(cols, row):
            if c in ('mailer_autoconfirm', 'sms_autoconfirm', 'enable_signup',
                     'enable_anonymous_signins', 'disable_signup',
                     'mailer_otp_exp', 'mailer_secure_url_change', 'external_email_enabled'):
                print(f"  {c} = {v}")
except Exception as e:
    print(f"  ERROR: {e}")
    conn.rollback()

cur.close()
conn.close()
