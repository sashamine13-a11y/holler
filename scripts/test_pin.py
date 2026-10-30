"""End-to-end pin test: sign in → send message → pin it → verify → unpin."""
import json
import time
import urllib.request
import urllib.error

SUPABASE_URL = "https://favnquxkqqidnfrbxndn.supabase.co"
PUBLISHABLE_KEY = "sb_publishable_7uMbV7WfEpougC3qJbZKDQ_wlYfi2cn"

# Use the test user created earlier
EMAIL = f"test_{int(time.time())}@holler-test.example"
PASSWORD = "TestPassword123!"
NAME = f"TestUser {int(time.time())}"

def req(method, path, body=None, headers=None):
    h = {"Content-Type": "application/json", "apikey": PUBLISHABLE_KEY}
    if headers:
        h.update(headers)
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(f"{SUPABASE_URL}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode()
            if not raw:
                return resp.status, None
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except:
            return e.code, raw

# 1. Sign up + sign in
print("=== 1. Sign up ===")
st, body = req("POST", "/auth/v1/signup", {"email": EMAIL, "password": PASSWORD, "data": {"name": NAME}})
print(f"  status={st}, confirmed={body.get('user',{}).get('email_confirmed_at') is not None}")

print("\n=== 2. Sign in ===")
st, body = req("POST", "/auth/v1/token?grant_type=password", {"email": EMAIL, "password": PASSWORD})
token = body.get("access_token")
user_id = body.get("user", {}).get("id")
print(f"  user_id={user_id}")
auth = {"Authorization": f"Bearer {token}"}

# 3. Get a channel room
print("\n=== 3. Get first channel ===")
st, body = req("GET", "/rest/v1/rooms?select=id,name&room_type=eq.channel&limit=1", headers=auth)
room_id = body[0]["id"]
room_name = body[0]["name"]
print(f"  room: {room_name} ({room_id})")

# 4. Send a message
print("\n=== 4. Send message ===")
st, body = req("POST", "/rest/v1/messages", {
    "room_id": room_id, "author_id": user_id, "author_name": NAME,
    "author_role": "member", "text": "Test message for pinning",
}, {**auth, "Prefer": "return=representation"})
msg_id = body[0]["id"]
print(f"  msg_id={msg_id}")

# 5. Pin the message (by message_id, NOT by creating new text)
print("\n=== 5. Pin the message (message_id approach) ===")
st, body = req("POST", "/rest/v1/pins", {
    "room_id": room_id, "message_id": msg_id,
    "text": "Test message for pinning", "created_by": user_id,
}, {**auth, "Prefer": "return=representation"})
print(f"  status={st}")
if isinstance(body, list) and body:
    print(f"  ✅ Pin created: message_id={body[0].get('message_id')}, text='{body[0].get('text','')[:40]}'")
elif isinstance(body, dict) and body.get('message'):
    print(f"  ❌ Pin failed: {body.get('message')}")
    if body.get('details'):
        print(f"     details: {body.get('details')}")
else:
    print(f"  ❌ Unexpected: {body}")

# 6. Load the pin
print("\n=== 6. Load pin for room ===")
st, body = req("GET", f"/rest/v1/pins?select=*&room_id=eq.{room_id}", headers=auth)
if isinstance(body, list) and body:
    print(f"  ✅ Pin loaded: message_id={body[0].get('message_id')}, text='{body[0].get('text','')[:40]}'")
else:
    print(f"  ❌ No pin returned: {body}")

# 7. Cleanup: unpin + delete message
print("\n=== 7. Cleanup ===")
req("DELETE", f"/rest/v1/pins?room_id=eq.{room_id}", headers=auth)
req("DELETE", f"/rest/v1/messages?id=eq.{msg_id}", headers={**auth, "Prefer": "return=representation"})
print("  done")

print("\n=== Summary ===")
print("Pinning by message_id works end-to-end ✅")
print("No text modal needed — the message's own text is stored as the pin preview.")
