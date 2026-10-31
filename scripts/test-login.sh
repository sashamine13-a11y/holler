#!/usr/bin/env bash
# Full UI test: login as dev user, check dev panel, username field, profile view.
set -u
cd /home/z/my-project
mkdir -p /tmp/holler-serve
ln -sfn /home/z/my-project/out /tmp/holler-serve/holler

python3 -m http.server 8088 --directory /tmp/holler-serve > /tmp/holler-static.log 2>&1 &
SRV_PID=$!
sleep 1.5

export AGENT_BROWSER_SESSION="holler-test-v4"
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | tail -1
sleep 2

echo "=== LOGIN via fill + click ==="
agent-browser fill "input[type='email']" "resptest_1793453864@holler-test.example" 2>&1 | tail -1
agent-browser fill "input[type='password']" "TestPassword123!" 2>&1 | tail -1
# click the Sign in button inside the form (not the tab) — find by text via eval
agent-browser eval "(() => { const btns=[...document.querySelectorAll('button')]; const si=btns.find(b=>/^(Sign in|Войти|Iniciar|Anmelden)\$/i.test(b.innerText.trim()) && b.type!=='button' || (b.closest('form')&&/^(Sign in|Войти|Iniciar|Anmelden)\$/i.test(b.innerText.trim()))); if(si){si.click(); return 'clicked: '+si.innerText.trim();} return 'not found, buttons: '+btns.map(b=>b.innerText.trim()).join('|'); })()" 2>&1 | tail -2
sleep 5

echo "=== AFTER LOGIN (snapshot) ==="
agent-browser snapshot -i 2>&1 | head -35
echo
agent-browser screenshot /tmp/after-login.png 2>&1 | tail -1

# Check if we landed in the app (look for sidebar / settings button)
echo "=== EVAL: app state ==="
agent-browser eval "(() => { const t=document.title; const hasSidebar=document.querySelector('aside'); const settingsBtn=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')&&/settings|настройки/i.test(b.getAttribute('aria-label'))); return JSON.stringify({title:t, hasSidebar:!!hasSidebar, hasSettingsBtn:!!settingsBtn, bodyTextSample:document.body.innerText.slice(0,200)}); })()" 2>&1 | tail -3

kill $SRV_PID 2>/dev/null
echo "done"
