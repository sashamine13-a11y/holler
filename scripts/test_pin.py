"""Test pinning a specific message via REST API."""
import json
import time
import urllib.request
import urllib.error

SUPABASE_URL = "https://favnquxkqqidnfrbxndn.supabase.co"
PUBLISHABLE_KEY = "sb_publishable_7uMbV7WfEpougC3qJbZKDQ_wlYfi2cn"

EMAIL = f"test_{int(time.time())}@holler-test.example"
PASSWORD = "TestPassword123!"
NAME = f"PinTest {int(time.time())}"

def req(method, path, body=None, headers=None, expect_repr=False):
    h = {
        "apikey": PUBLISHABLE_KEY,
        "Content-Type": "application/json",
    }
    if headers:
        h.update(headers)
    if expect_repr:
        h["Prefer"] = "return=representation"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{SUPABASE_URL}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            body = resp.read().decode()
            return resp.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return e.code, (json.loads(body) if body else None)

# Sign up + sign in
print(f"=== Sign up: {EMAIL} ===")
st, body = req("POST", "/auth/v1/signup", {"email": EMAIL, "password": PASSWORD, "data": {"name": NAME}})
print(f"  status={st}, has_user={'user' in (body or {})}")

print("\n=== Sign in ===")
st, body = req("POST", "/auth/v1/token?grant_type=password", {"email": EMAIL, "password": PASSWORD})
token = body.get("access_token") if body else None
user_id = body.get("user", {}).get("id") if body else None
print(f"  status={st}, user_id={user_id}, token={'present' if token else 'NONE'}")

auth = {"Authorization": f"Bearer {token}"}

# Get first channel
print("\n=== Get first channel ===")
st, body = req("GET", "/rest/v1/rooms?select=id,name&room_type=eq.channel&limit=1", headers=auth)
room_id = body[0]["id"] if isinstance(body, list) and body else None
room_name = body[0]["name"] if body else "?"
print(f"  room_id={room_id} ({room_name})")

# Send a test message
print("\n=== Send test message ===")
st, body = req("POST", "/rest/v1/messages", {
    "room_id": room_id,
    "author_id": user_id,
    "author_name": NAME,
    "author_role": "member",
    "text": f"Pin target message ({int(time.time())})",
}, headers={**auth, "Prefer": "return=representation"})
msg_id = body[0]["id"] if isinstance(body, list) and body else None
print(f"  status={st}, msg_id={msg_id}")

# Pin that specific message
print("\n=== Pin the message (with message_id) ===")
# First delete any existing pin
req("DELETE", f"/rest/v1/pins?room_id=eq.{room_id}", headers=auth)
# Now insert the pin with message_id
st, body = req("POST", "/rest/v1/pins", {
    "room_id": room_id,
    "message_id": msg_id,
    "text": "Pin target message",
    "created_by": user_id,
}, headers={**auth, "Prefer": "return=representation"})
print(f"  insert status={st}")
if isinstance(body, list) and body:
    pin = body[0]
    print(f"  pin.id={pin.get('id')}")
    print(f"  pin.room_id={pin.get('room_id')}")
    print(f"  pin.message_id={pin.get('message_id')}")
    print(f"  pin.text={pin.get('text')[:60] if pin.get('text') else None}")
    if pin.get("message_id") == msg_id:
        print(f"  ✅ message_id correctly stored")
    else:
        print(f"  ❌ message_id mismatch")
else:
    print(f"  ❌ Insert failed: {body}")

# Read the pin back
print("\n=== Read pin back ===")
st, body = req("GET", f"/rest/v1/pins?select=message_id,text,created_at&room_id=eq.{room_id}&limit=1", headers=auth)
print(f"  status={st}")
if isinstance(body, list) and body:
    pin = body[0]
    print(f"  message_id={pin.get('message_id')}")
    print(f"  text={pin.get('text')[:60]}")
    if pin.get("message_id") == msg_id:
        print(f"  ✅ loadPin returns correct message_id")
    else:
        print(f"  ❌ mismatch")

# Cleanup
print("\n=== Cleanup ===")
req("DELETE", f"/rest/v1/pins?room_id=eq.{room_id}", headers=auth)
req("DELETE", f"/rest/v1/messages?id=eq.{msg_id}", headers=auth)
print("  done")
