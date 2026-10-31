#!/usr/bin/env bash
# Test v5: signup form with username field, settings about field, profile view with about
set -u
cd /home/z/my-project
mkdir -p /tmp/holler-serve
ln -sfn /home/z/my-project/out /tmp/holler-serve/holler

python3 -m http.server 8088 --directory /tmp/holler-serve > /tmp/holler-static.log 2>&1 &
SRV_PID=$!
sleep 1.5

export AGENT_BROWSER_SESSION="holler-test-v5"
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | tail -1
sleep 3

# clear localStorage to start fresh
agent-browser eval "(()=>{localStorage.clear(); return 'cleared';})()" 2>&1 | tail -1
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | tail -1
sleep 2

# switch to sign-up tab
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>/^Sign up\$/.test(b.innerText.trim())); if(b){b.click();return 'signup tab';} return 'no tab'; })()" 2>&1 | tail -1
sleep 1

echo "=== SIGNUP FORM FIELDS ==="
agent-browser snapshot -i 2>&1 | head -25
echo

# fill the form (name, username optional, email, password, secret q, secret a)
agent-browser fill "#name" "TestUser BioCheck" 2>&1 | tail -1
agent-browser fill "#signup-username" "biotest" 2>&1 | tail -1
agent-browser fill "#email" "biotest_$(date +%s)@holler-test.example" 2>&1 | tail -1
agent-browser fill "#password" "TestPassword123!" 2>&1 | tail -1
agent-browser fill "#secret-q" "Pet name?" 2>&1 | tail -1
agent-browser fill "#secret-a" "Cat" 2>&1 | tail -1

echo "=== After fill: username field present? ==="
agent-browser eval "(() => { const u=document.querySelector('#signup-username'); const about=document.querySelector('#st-about'); return JSON.stringify({signupUsername: u?u.value:'missing', hasAboutInSignup: !!about}); })()" 2>&1 | tail -2

# don't submit yet — just verify field exists; switch back to signin for safety
kill $SRV_PID 2>/dev/null
echo "done"
