#!/usr/bin/env bash
# Test: search person in sidebar → click → UserProfileModal (not DM)
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

# clear search and type a person name that isn't a channel
agent-browser eval "(() => { const inp=document.querySelector('input[placeholder*=\"Search\"]'); if(inp){inp.focus(); inp.value='v3_own_1793463968'; inp.dispatchEvent(new Event('input',{bubbles:true})); return 'searched';} return 'no input'; })()" 2>&1 | tail -1
sleep 1.5

echo "=== People search results ==="
agent-browser eval "(() => { const aside=document.querySelector('aside'); const txt=aside.innerText; const hasPeople=/PEOPLE|ЛЮДИ|PERSONAS|PERSONEN|v3_own/i.test(txt); return JSON.stringify({asideSnippet:txt.slice(0,400), hasPeopleRef:hasPeople}); })()" 2>&1 | tail -2

# click the person result (button with @v3_own in the people section)
agent-browser eval "(() => { const btns=[...document.querySelectorAll('aside button')]; const hit=btns.find(b=>/v3_own_1793463968/i.test(b.innerText) && /@/.test(b.innerText)); if(hit){hit.click();return 'clicked person: '+hit.innerText.trim().replace(/\\s+/g,' ');} const any=btns.find(b=>/v3_own_1793463968/i.test(b.innerText)); if(any){any.click();return 'clicked fallback: '+any.innerText.trim().replace(/\\s+/g,' ');} return 'not found'; })()" 2>&1 | tail -2
sleep 2

echo "=== After click: is profile modal open? ==="
agent-browser eval "(() => { const dlgs=[...document.querySelectorAll('[role=dialog]')]; if(dlgs.length===0) return 'no dialog (DM started?)'; const d=dlgs[dlgs.length-1]; const h=d.innerText; return JSON.stringify({isProfile:/^Profile\$|^Профиль\$|^Perfil\$|^Profil\$/m.test(h), hasMessageBtn:/Message|Написать/i.test(h), sample:h.slice(0,200)}); })()" 2>&1 | tail -2
agent-browser screenshot /tmp/v4-profile3.png 2>&1 | tail -1

kill $SRV_PID 2>/dev/null
echo "done"
