#!/usr/bin/env python3
"""
End-to-end group member management test (RLS):
A creates group -> trigger makes A admin.
1) A adds B  -> allowed (creator)
2) B adds C  -> FORBIDDEN (member, not admin)
3) A removes B -> allowed (admin)
4) B tries to remove A -> FORBIDDEN (not member anymore / not admin)
5) A leaves via self-delete -> allowed (self)
Cleanup: delete test rooms.
"""
import json
import time
import urllib.request
import urllib.error

SUPABASE_URL = "https://favnquxkqqidnfrbxndn.supabase.co"
KEY = "sb_publishable_7uMbV7WfEpougC3qJbZKDQ_wlYfi2cn"
STAMP = int(time.time())

def req(method, path, body=None, headers=None):
    h = {"Content-Type": "application/json", "apikey": KEY}
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
        except Exception:
            return e.code, raw

def signup_and_login(email, name):
    req("POST", "/auth/v1/signup", {"email": email, "password": "TestPassword123!", "data": {"name": name}})
    st, body = req("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": "TestPassword123!"})
    assert st == 200, f"login failed {st} {body}"
    tok = body["access_token"]
    uid_ = body["user"]["id"]
    return tok, uid_

print("=== create users A and B ===")
tokA, idA = signup_and_login(f"grpA_{STAMP}@holler-test.example", f"GrpA {STAMP}")
tokB, idB = signup_and_login(f"grpB_{STAMP}@holler-test.example", f"GrpB {STAMP}")
print(f"  A={idA[:8]}  B={idB[:8]}")
authA = {"Authorization": f"Bearer {tokA}"}
authB = {"Authorization": f"Bearer {tokB}"}

print("\n=== A creates group ===")
st, room = req("POST", "/rest/v1/rooms", {
    "name": f"RLS test group {STAMP}", "kind": "chat", "room_type": "group",
    "category": "group", "created_by": idA,
}, headers={**authA, "Prefer": "return=representation"})
assert st == 201 and room, f"create group failed: {st} {room}"
room_id = room[0]["id"] if isinstance(room, list) else room["id"]
print(f"  room={room_id}")

st, mems = req("GET", f"/rest/v1/room_members?room_id=eq.{room_id}&select=user_id,role", headers=authA)
print(f"  members after trigger: {mems}")
assert any(m["user_id"] == idA and m["role"] == "admin" for m in mems), "creator should be admin"

def add_member(tok, uid_):
    return req("POST", "/rest/v1/room_members", {"room_id": room_id, "user_id": uid_, "role": "member"},
               headers={"Authorization": f"Bearer {tok}"})

def del_member(tok, uid_):
    return req("DELETE", f"/rest/v1/room_members?room_id=eq.{room_id}&user_id=eq.{uid_}",
               headers={"Authorization": f"Bearer {tok}"})

def get_members():
    st, ms = req("GET", f"/rest/v1/room_members?room_id=eq.{room_id}&select=user_id,role", headers=authA)
    assert st == 200, ms
    return {m["user_id"] for m in ms}

print("\n=== 1. A adds B (expect 201) ===")
st, body = add_member(tokA, idB)
print(f"  status={st}")
assert st == 201, f"A add B failed: {st} {body}"
assert idB in get_members(), "B should be a member"

print("\n=== 2. B adds a stranger C (expect FAIL) ===")
tokC, idC = signup_and_login(f"grpC_{STAMP}@holler-test.example", f"GrpC {STAMP}")
st, body = add_member(tokB, idC)
print(f"  status={st} (403/4xx expected)")
assert st >= 400, "B must NOT be able to add members!"
assert idC not in get_members(), "C must not have been added"

print("\n=== 3. B removes A (expect silent no-op) ===")
st, body = del_member(tokB, idA)
print(f"  status={st} — verifying A is still a member…")
assert idA in get_members(), "B must NOT be able to remove other members!"

print("\n=== 4. A removes B (expect gone) ===")
st, body = del_member(tokA, idB)
print(f"  status={st}")
assert idB not in get_members(), "A (admin) should be able to remove B"

print("\n=== 5. A leaves group self-delete (expect gone) ===")
st, body = del_member(tokA, idA)
print(f"  status={st}")
assert idA not in get_members(), "self-leave should work"

print("\n=== cleanup rooms ===")
st, _ = req("DELETE", f"/rest/v1/rooms?id=eq.{room_id}", headers=authA)
print(f"  delete room status={st}")

print("\n✅ ALL RLS MEMBER-MANAGEMENT CHECKS PASSED")
