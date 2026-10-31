#!/usr/bin/env bash
# Test: footer @username, settings (username field + dev panel), profile view
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

# login
agent-browser fill "input[type='email']" "resptest_1793453864@holler-test.example" 2>&1 | tail -1
agent-browser fill "input[type='password']" "TestPassword123!" 2>&1 | tail -1
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>/^Sign in\$/.test(b.innerText.trim())&&b.closest('form')); if(b){b.click();return 'ok';} return 'no'; })()" 2>&1 | tail -1
sleep 5

echo "=== FOOTER @username check ==="
agent-browser eval "(() => { const aside=document.querySelector('aside'); if(!aside) return 'no aside'; const txt=aside.innerText; return JSON.stringify({footerText:txt.slice(-120)}); })()" 2>&1 | tail -2
agent-browser screenshot /tmp/v4-footer.png 2>&1 | tail -1

echo "=== OPEN SETTINGS ==="
# click settings button (aria-label Settings)
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>{const a=b.getAttribute('aria-label');return a&&/settings|настройки/i.test(a);}); if(b){b.click();return 'clicked';} return 'not found'; })()" 2>&1 | tail -1
sleep 2
agent-browser screenshot /tmp/v4-settings.png 2>&1 | tail -1

echo "=== SETTINGS snapshot (first 50) ==="
agent-browser snapshot -i 2>&1 | head -50
echo

echo "=== Check username field + dev panel present ==="
agent-browser eval "(() => { const dlg=document.querySelector('[role=dialog]'); if(!dlg) return 'no dialog'; const h=dlg.innerText; const hasUname=/username|юзернейм|benutzername|nombre de usuario/i.test(h); const hasDev=/developer|разработчик|entwickler|desarrollador/i.test(h); const hasActions=/actions|действия|aktionen|acciones/i.test(h); const buttons=[...dlg.querySelectorAll('button')].map(b=>b.innerText.trim()).filter(Boolean); return JSON.stringify({hasUsername:hasUname, hasDev:hasDev, hasActions:hasActions, buttons:buttons.slice(0,15)}); })()" 2>&1 | tail -3

kill $SRV_PID 2>/dev/null
echo "done"
