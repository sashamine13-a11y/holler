#!/usr/bin/env bash
# Test profile viewing: search a person, click → UserProfileModal
set -u
cd /home/z/my-project
mkdir -p /tmp/holler-serve
ln -sfn /home/z/my-project/out /tmp/holler-serve/holler

python3 -m http.server 8088 --directory /tmp/holler-serve > /tmp/holler-static.log 2>&1 &
SRV_PID=$!
sleep 1.5

export AGENT_BROWSER_SESSION="holler-test-v4"
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | tail -1
sleep 3

# search for v3_m1 (a dev user) in the sidebar search
agent-browser eval "(() => { const inp=document.querySelector('input[placeholder*=\"Search\"]'); if(inp){inp.focus(); inp.value='v3_m1'; inp.dispatchEvent(new Event('input',{bubbles:true})); return 'searched';} return 'no input'; })()" 2>&1 | tail -1
sleep 1.5

echo "=== Search results ==="
agent-browser snapshot -i 2>&1 | head -30
echo

# click the first person result (button containing @v3_m1 or the name)
agent-browser eval "(() => { const btns=[...document.querySelectorAll('aside button')]; const hit=btns.find(b=>/v3_m1/i.test(b.innerText)); if(hit){hit.click(); return 'clicked: '+hit.innerText.trim().replace(/\\s+/g,' ');} return 'not found, buttons: '+btns.map(b=>b.innerText.trim().replace(/\\s+/g,' ')).join(' | '); })()" 2>&1 | tail -2
sleep 2

echo "=== Profile modal ==="
agent-browser screenshot /tmp/v4-profile.png 2>&1 | tail -1
agent-browser snapshot -i 2>&1 | head -30
echo

echo "=== Profile modal content check ==="
agent-browser eval "(() => { const dlg=document.querySelector('[role=dialog]'); if(!dlg) return 'no dialog'; const h=dlg.innerText; return JSON.stringify({text:h.slice(0,400), hasMessageBtn:/message|написать|mensaje|nachricht/i.test(h), hasUsername:/@v3_m1/i.test(h), hasJoined:/joined|с нами|se unió|beigetreten/i.test(h)}); })()" 2>&1 | tail -2

kill $SRV_PID 2>/dev/null
echo "done"
