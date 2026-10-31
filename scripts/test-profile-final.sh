#!/usr/bin/env bash
# Test: click message author → UserProfileModal with about shown
set -u
cd /home/z/my-project
mkdir -p /tmp/holler-serve
ln -sfn /home/z/my-project/out /tmp/holler-serve/holler

python3 -m http.server 8088 --directory /tmp/holler-serve > /tmp/holler-static.log 2>&1 &
SRV_PID=$!
sleep 1.5

export AGENT_BROWSER_SESSION="holler-test-v5c"
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | tail -1
sleep 3

# login
agent-browser fill "input[type='email']" "resptest_1793453864@holler-test.example" 2>&1 | tail -1
agent-browser fill "input[type='password']" "TestPassword123!" 2>&1 | tail -1
agent-browser eval "(() => { const si=[...document.querySelectorAll('button')].find(b=>b.className.includes('w-full') && /sign in/i.test(b.innerText.trim())); if(si){si.click();return 'ok';} return 'no'; })()" 2>&1 | tail -1
sleep 6

# open Dev Channel
agent-browser eval "(() => { const b=[...document.querySelectorAll('aside button')].find(b=>/^Dev Channel/.test(b.innerText.trim())); if(b){b.click();return 'opened';} return 'no channel'; })()" 2>&1 | tail -1
sleep 2

# first set our own about (resptest) so profile view shows it
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>{const a=b.getAttribute('aria-label');return a&&/settings|настройки/i.test(a);}); if(b){b.click();return 'open settings';} return 'no'; })()" 2>&1 | tail -1
sleep 2
# fill about
agent-browser fill "#st-about" "Backend dev. Coffee-powered. Holler maintainer." 2>&1 | tail -1
sleep 0.5
# click save (button text may include Check icon — match by 'Save' substring)
agent-browser eval "(() => { const b=[...document.querySelectorAll('[role=dialog] button')].find(b=>/save/i.test(b.innerText.trim())); if(b){b.click();return 'saved';} return 'no save'; })()" 2>&1 | tail -1
sleep 3
# close via X
agent-browser eval "(() => { const x=document.querySelector('[role=dialog] [aria-label=\"Close\"]') || [...document.querySelectorAll('[role=dialog] button')].find(b=>{const s=b.querySelector('svg');return s && b.innerText.trim()==='';}); if(x){x.click();return 'closed';} return 'no x'; })()" 2>&1 | tail -1
sleep 1

# now click own message author in the channel (resptest_1793453864 should have posted? or click v3_m1)
# First, click the author name button "v3_m1_1793463970"
agent-browser eval "(() => { const btns=[...document.querySelectorAll('button')]; const au=btns.find(b=>b.innerText.trim()==='v3_m1_1793463970'); if(au){au.click();return 'clicked author v3_m1';} return 'not found'; })()" 2>&1 | tail -1
sleep 2

echo "=== Profile modal (v3_m1) ==="
agent-browser eval "(() => { const dlgs=[...document.querySelectorAll('[role=dialog]')]; const d=dlgs[dlgs.length-1]; if(!d) return 'no dialog'; const h=d.innerText; return JSON.stringify({sample:h.slice(0,300), hasAtHandle:/@v3_m1/i.test(h), hasRole:/developer/i.test(h), hasJoined:/joined/i.test(h), hasMessageBtn:/message/i.test(h)}); })()" 2>&1 | tail -2
agent-browser screenshot /tmp/v5-profile-other.png 2>&1 | tail -1

# also test clicking own author name if present
agent-browser eval "(() => { const x=document.querySelector('[role=dialog] [aria-label=\"Close\"]'); if(x){x.click();return 'closed';} return 'no'; })()" 2>&1 | tail -1
sleep 1
agent-browser eval "(() => { const btns=[...document.querySelectorAll('button')]; const au=btns.find(b=>b.innerText.trim()==='resptest_1793453864'); if(au){au.click();return 'clicked own author';} return 'no own msg author'; })()" 2>&1 | tail -1
sleep 2
echo "=== Own profile modal (via author click) ==="
agent-browser eval "(() => { const dlgs=[...document.querySelectorAll('[role=dialog]')]; const d=dlgs[dlgs.length-1]; if(!d) return 'no dialog'; const h=d.innerText; return JSON.stringify({sample:h.slice(0,300), hasAbout:/Coffee-powered/.test(h), hasAtHandle:/@resptest/i.test(h), hasEditBtn:/edit profile/i.test(h)}); })()" 2>&1 | tail -2

kill $SRV_PID 2>/dev/null
echo "done"
