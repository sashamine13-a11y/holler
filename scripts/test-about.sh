#!/usr/bin/env bash
# Test v5: settings about field + profile view with about
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

# login as dev user
agent-browser fill "input[type='email']" "resptest_1793453864@holler-test.example" 2>&1 | tail -1
agent-browser fill "input[type='password']" "TestPassword123!" 2>&1 | tail -1
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>/^Sign in\$/.test(b.innerText.trim())&&b.closest('form')); if(b){b.click();return 'ok';} return 'no'; })()" 2>&1 | tail -1
sleep 5

echo "=== Open settings ==="
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>{const a=b.getAttribute('aria-label');return a&&/settings|настройки/i.test(a);}); if(b){b.click();return 'clicked';} return 'not found'; })()" 2>&1 | tail -1
sleep 2

echo "=== Check about field + username optional marker ==="
agent-browser eval "(() => { const dlg=document.querySelector('[role=dialog]'); if(!dlg) return 'no dialog'; const labels=[...dlg.querySelectorAll('label')].map(l=>l.innerText.trim().replace(/\\s+/g,' ')); const about=document.querySelector('#st-about'); const uname=document.querySelector('#st-username'); return JSON.stringify({labels:labels, hasAboutField:!!about, aboutPlaceholder: about?about.placeholder:'n/a', usernamePlaceholder: uname?uname.placeholder:'n/a'}); })()" 2>&1 | tail -3

# fill about and save
agent-browser fill "#st-about" "Backend dev. Coffee-powered." 2>&1 | tail -1
agent-browser eval "(() => { const b=[...document.querySelectorAll('[role=dialog] button')].find(b=>/^Save\$/.test(b.innerText.trim())); if(b){b.click();return 'saved';} return 'no save btn'; })()" 2>&1 | tail -1
sleep 3

echo "=== Verify about saved in DB ==="
agent-browser eval "(() => { return 'still in settings, check DB separately'; })()" 2>&1 | tail -1

# close settings, open own profile via footer avatar click
agent-browser eval "(() => { const b=[...document.querySelectorAll('[role=dialog] button')].find(b=>/close|закрыть/i.test(b.getAttribute('aria-label')||b.innerText)); if(b){b.click();return 'closed';} return 'no close'; })()" 2>&1 | tail -1
sleep 1

# click footer avatar to open own profile
agent-browser eval "(() => { const aside=document.querySelector('aside'); const btn=aside.querySelector('button'); if(btn){btn.click();return 'clicked footer';} return 'no footer btn'; })()" 2>&1 | tail -1
sleep 2

echo "=== Own profile modal ==="
agent-browser eval "(() => { const dlgs=[...document.querySelectorAll('[role=dialog]')]; const d=dlgs[dlgs.length-1]; if(!d) return 'no dialog'; const h=d.innerText; return JSON.stringify({sample:h.slice(0,300), hasAbout:/Coffee-powered/.test(h), hasAtHandle:/@resptest/i.test(h), hasEditBtn:/edit profile|редактировать/i.test(h)}); })()" 2>&1 | tail -2
agent-browser screenshot /tmp/v5-own-profile.png 2>&1 | tail -1

kill $SRV_PID 2>/dev/null
echo "done"
