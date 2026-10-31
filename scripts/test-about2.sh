#!/usr/bin/env bash
# Test v5: settings about field + profile view with about (robust version)
set -u
cd /home/z/my-project
mkdir -p /tmp/holler-serve
ln -sfn /home/z/my-project/out /tmp/holler-serve/holler

python3 -m http.server 8088 --directory /tmp/holler-serve > /tmp/holler-static.log 2>&1 &
SRV_PID=$!
sleep 1.5

export AGENT_BROWSER_SESSION="holler-test-v5b"
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | tail -1
sleep 3

# wait for auth form ready
agent-browser eval "(() => { const i=document.querySelector('input[type=email]'); return i?'ready':'not ready'; })()" 2>&1 | tail -1

# login as dev user
agent-browser fill "input[type='email']" "resptest_1793453864@holler-test.example" 2>&1 | tail -1
agent-browser fill "input[type='password']" "TestPassword123!" 2>&1 | tail -1
# verify fields filled
agent-browser eval "(() => { const e=document.querySelector('input[type=email]'); const p=document.querySelector('input[type=password]'); return JSON.stringify({email:e?e.value:'none', pwLen:p?p.value.length:0}); })()" 2>&1 | tail -1
# click the main submit button (the big full-width one with "Sign in" + arrow)
agent-browser eval "(() => { const btns=[...document.querySelectorAll('button')]; // the submit button is full-width and contains 'Sign in' text + ArrowRight svg
  const si=btns.find(b=>b.className.includes('w-full') && /sign in/i.test(b.innerText.trim())); if(si){si.click();return 'clicked';} return 'no btn, candidates: '+btns.filter(b=>b.className.includes('w-full')).map(b=>b.innerText.trim().slice(0,20)).join('|'); })()" 2>&1 | tail -2
sleep 6

# are we in app?
agent-browser eval "(() => { const aside=document.querySelector('aside'); const title=document.title; return JSON.stringify({hasAside:!!aside, title:title}); })()" 2>&1 | tail -1

echo "=== Open settings ==="
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>{const a=b.getAttribute('aria-label');return a&&/settings|настройки/i.test(a);}); if(b){b.click();return 'clicked';} return 'not found, btns:'+[...document.querySelectorAll('button')].map(b=>b.getAttribute('aria-label')||b.innerText.trim().slice(0,20)).slice(0,15).join('|'); })()" 2>&1 | tail -2
sleep 2

echo "=== Check about field ==="
agent-browser eval "(() => { const dlg=document.querySelector('[role=dialog]'); if(!dlg) return 'no dialog'; const about=document.querySelector('#st-about'); const uname=document.querySelector('#st-username'); return JSON.stringify({hasAboutField:!!about, aboutPlaceholder: about?about.placeholder:'n/a', usernamePlaceholder: uname?uname.placeholder:'n/a', usernameValue: uname?uname.value:'n/a'}); })()" 2>&1 | tail -2

# fill about
agent-browser fill "#st-about" "Backend dev. Coffee-powered." 2>&1 | tail -1
sleep 0.5
# save
agent-browser eval "(() => { const b=[...document.querySelectorAll('[role=dialog] button')].find(b=>/^Save\$/.test(b.innerText.trim())); if(b){b.click();return 'saved';} return 'no save btn'; })()" 2>&1 | tail -1
sleep 3

# close dialog via the X close button (top-right of dialog)
agent-browser eval "(() => { const x=[...document.querySelectorAll('[role=dialog] button, [role=dialog] [aria-label]')].find(b=>{const a=(b.getAttribute('aria-label')||'').toLowerCase(); return a.includes('close')||a.includes('закрыть');}); if(x){x.click();return 'closed';} return 'no close btn'; })()" 2>&1 | tail -1
sleep 1

echo "=== Open own profile via footer ==="
agent-browser eval "(() => { const aside=document.querySelector('aside'); if(!aside) return 'no aside'; const btns=[...aside.querySelectorAll('button')]; const footerBtn=btns.find(b=>/resptest/i.test(b.innerText) && /@resptest/i.test(b.innerText)); if(footerBtn){footerBtn.click();return 'clicked footer';} return 'no footer btn'; })()" 2>&1 | tail -1
sleep 2

echo "=== Own profile modal content ==="
agent-browser eval "(() => { const dlgs=[...document.querySelectorAll('[role=dialog]')]; const d=dlgs[dlgs.length-1]; if(!d) return 'no dialog'; const h=d.innerText; return JSON.stringify({sample:h.slice(0,400), hasAbout:/Coffee-powered/.test(h), hasAtHandle:/@resptest/i.test(h), hasEditBtn:/edit profile|редактировать/i.test(h)}); })()" 2>&1 | tail -2
agent-browser screenshot /tmp/v5-profile-final.png 2>&1 | tail -1

kill $SRV_PID 2>/dev/null
echo "done"
