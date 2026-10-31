#!/usr/bin/env bash
# Test profile viewing: click message author → UserProfileModal
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

# open Dev Channel (click the channel in sidebar)
agent-browser eval "(() => { const b=[...document.querySelectorAll('aside button')].find(b=>/^Dev Channel/.test(b.innerText.trim())); if(b){b.click();return 'opened channel';} return 'no channel'; })()" 2>&1 | tail -1
sleep 2

# click the message author (button with text exactly 'v3_m1_1793463970' — the author name button)
agent-browser eval "(() => { const btns=[...document.querySelectorAll('button')]; const au=btns.find(b=>b.innerText.trim()==='v3_m1_1793463970'); if(au){au.click();return 'clicked author: '+au.innerText.trim();} return 'no author btn, candidates: '+btns.filter(b=>/v3_m1/.test(b.innerText)).map(b=>b.innerText.trim()).join('|'); })()" 2>&1 | tail -2
sleep 2

echo "=== Profile modal snapshot ==="
agent-browser snapshot -i 2>&1 | head -25
echo
agent-browser screenshot /tmp/v4-profile2.png 2>&1 | tail -1

echo "=== Profile modal content ==="
agent-browser eval "(() => { const dlgs=[...document.querySelectorAll('[role=dialog]')]; const dlg=dlgs[dlgs.length-1]; if(!dlg) return 'no dialog'; const h=dlg.innerText; return JSON.stringify({sample:h.slice(0,500), hasMessageBtn:/message|написать/i.test(h), hasAtHandle:/@v3_m1_1793463970/i.test(h), hasJoined:/joined|с нами/i.test(h), hasRole:/developer|разработчик/i.test(h)}); })()" 2>&1 | tail -2

kill $SRV_PID 2>/dev/null
echo "done"
