"""End-to-end auth test via Supabase REST API.

Tests:
1. Sign up a new user with a unique email
2. Verify the user has email_confirmed_at set (auto-confirm trigger)
3. Sign in with that user
4. Verify the session works by reading profiles
5. Test message edit RLS (create + update own message)
"""
import json
import time
import urllib.request
import urllib.error

SUPABASE_URL = "https://favnquxkqqidnfrbxndn.supabase.co"
PUBLISHABLE_KEY = "sb_publishable_7uMbV7WfEpougC3qJbZKDQ_wlYfi2cn"

UNIQUE = f"test_{int(time.time())}"
EMAIL = f"test_{int(time.time())}@holler-test.example"
PASSWORD = "TestPassword123!"
NAME = f"TestUser {UNIQUE}"

def post(path, body, headers=None):
    h = {
        "Content-Type": "application/json",
        "apikey": PUBLISHABLE_KEY,
    }
    if headers:
        h.update(headers)
    req = urllib.request.Request(
        f"{SUPABASE_URL}{path}",
        data=json.dumps(body).encode(),
        headers=h,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())
    except Exception as e:
        return 0, {"error": str(e)}

def get(path, headers=None):
    h = {"apikey": PUBLISHABLE_KEY}
    if headers:
        h.update(headers)
    req = urllib.request.Request(f"{SUPABASE_URL}{path}", headers=h, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())
    except Exception as e:
        return 0, {"error": str(e)}

print(f"=== 1. Sign up: {EMAIL} ===")
status, body = post("/auth/v1/signup", {
    "email": EMAIL,
    "password": PASSWORD,
    "data": {"name": NAME},
})
print(f"  status={status}")
print(f"  has_session={'session' in body and body.get('session') is not None}")
print(f"  has_user={'user' in body}")
if body.get("user"):
    print(f"  user.email_confirmed_at={body['user'].get('email_confirmed_at')}")
if body.get("error"):
    print(f"  error: {body.get('error_description') or body.get('error')}")
    print("\n=== Aborting: signup failed ===")
    exit(1)

session_token = body.get("session", {}).get("access_token") if body.get("session") else None
print(f"  session_token={'present' if session_token else 'NONE'}")

print("\n=== 2. Sign in ===")
status, body = post("/auth/v1/token?grant_type=password", {
    "email": EMAIL,
    "password": PASSWORD,
})
print(f"  status={status}")
if body.get("error"):
    print(f"  error: {body.get('error_description') or body.get('error')}")
else:
    session_token = body.get("access_token")
    user_id = body.get("user", {}).get("id")
    print(f"  user_id={user_id}")
    print(f"  email_confirmed_at={body.get('user', {}).get('email_confirmed_at')}")

if not session_token:
    print("\n=== Aborting: no session ===")
    exit(1)

auth_headers = {"Authorization": f"Bearer {session_token}"}

print("\n=== 3. Read profiles (should now see ALL authenticated users) ===")
status, body = get("/rest/v1/profiles?select=id,name,email", auth_headers)
print(f"  status={status}")
if isinstance(body, list):
    print(f"  profiles returned: {len(body)}")
    for p in body[:3]:
        print(f"    - {p.get('name')} <{p.get('email')}>")
else:
    print(f"  body: {body}")

print("\n=== 4. Read rooms ===")
status, body = get("/rest/v1/rooms?select=id,name,room_type&limit=10", auth_headers)
print(f"  status={status}")
if isinstance(body, list):
    print(f"  rooms: {len(body)}")
    for r in body[:3]:
        print(f"    - {r.get('name')} (type={r.get('room_type')})")
else:
    print(f"  body: {body}")

print("\n=== 5. Send a test message to the first channel ===")
status, body = get("/rest/v1/rooms?select=id&room_type=eq.channel&limit=1", auth_headers)
if isinstance(body, list) and body:
    room_id = body[0]["id"]
    print(f"  room_id={room_id}")
    status, body = post("/rest/v1/messages", {
        "room_id": room_id,
        "author_id": user_id,
        "author_name": NAME,
        "author_role": "member",
        "text": f"Test message from automated check ({UNIQUE})",
    }, {**auth_headers, "Prefer": "return=representation"})
    print(f"  insert status={status}")
    if isinstance(body, list) and body:
        msg_id = body[0]["id"]
        print(f"  msg_id={msg_id}")
        print(f"  text={body[0].get('text')[:60]}")

        # Wait a moment, then test edit
        time.sleep(1)
        print("\n=== 6. Edit the message (UPDATE should work for author) ===")
        # Supabase REST uses PATCH for updates
        h = {
            "Content-Type": "application/json",
            "apikey": PUBLISHABLE_KEY,
            "Authorization": f"Bearer {session_token}",
            "Prefer": "return=representation",
        }
        new_text = f"EDITED at {int(time.time())}"
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/messages?id=eq.{msg_id}",
            data=json.dumps({"text": new_text, "edited_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}).encode(),
            headers=h,
            method="PATCH",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                patched = json.loads(resp.read().decode())
                if patched and patched[0].get("text") == new_text:
                    print(f"  ✅ Edit succeeded: text='{patched[0]['text'][:60]}'")
                    print(f"  edited_at={patched[0].get('edited_at')}")
                else:
                    print(f"  ⚠️  Unexpected response: {patched}")
        except urllib.error.HTTPError as e:
            err = e.read().decode()
            print(f"  ❌ Edit failed: {e.code} {err}")

        # Cleanup: delete the test message
        print("\n=== 7. Cleanup: delete the test message ===")
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/messages?id=eq.{msg_id}",
            headers={**auth_headers, "Prefer": "return=representation"},
            method="DELETE",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                print(f"  delete status={resp.status}")
        except urllib.error.HTTPError as e:
            print(f"  delete failed: {e.code} {e.read().decode()}")
    else:
        print(f"  ❌ Insert failed: {body}")
else:
    print(f"  No rooms returned: {body}")

print("\n=== All tests complete ===")
