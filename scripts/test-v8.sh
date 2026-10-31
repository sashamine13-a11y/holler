#!/usr/bin/env bash
# Test v7: browse channels, subscribe, reactions, search
set -u
cd /home/z/my-project
mkdir -p /tmp/holler-serve
ln -sfn /home/z/my-project/out /tmp/holler-serve/holler
python3 -m http.server 8088 --directory /tmp/holler-serve > /tmp/holler-static.log 2>&1 &
SRV=$!
sleep 1.5
export AGENT_BROWSER_SESSION="holler-test-v8"
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 2
agent-browser fill "input[type='email']" "resptest_1793453864@holler-test.example" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser fill "input[type='password']" "TestPassword123!" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser eval "(()=>{const si=[...document.querySelectorAll('button')].find(b=>b.className.includes('w-full')&&/sign in/i.test(b.innerText.trim()));if(si){si.click();return 'ok';}return 'no';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 7

echo "=== Sidebar: browse channels button visible? ==="
agent-browser eval "(()=>{const aside=document.querySelector('aside');if(!aside)return 'no aside';const txt=aside.innerText;return JSON.stringify({hasBrowse:/browse channels|смотреть каналы/i.test(txt),hasJoinableCount:/browse channels.*\d|смотреть каналы.*\d/is.test(txt),joinableMatch:txt.match(/browse channels[^\n]*|смотреть каналы[^\n]*/i)});})()" 2>&1 | grep -E "^\{|^\"" | tail -1

echo "=== Open browse channels modal ==="
agent-browser eval "(()=>{const b=[...document.querySelectorAll('aside button')].find(b=>/browse channels|смотреть каналы/i.test(b.innerText));if(b){b.click();return 'clicked';}return 'no btn';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 2
echo "=== Browse modal content ==="
agent-browser eval "(()=>{const d=document.querySelector('[role=dialog]');if(!d)return 'no dialog';const txt=d.innerText;return JSON.stringify({hasAnnouncements:/announcements/i.test(txt),hasSubscribeBtn:d.querySelectorAll('button').length>1,sample:txt.slice(0,200)});})()" 2>&1 | grep -E "^\{|^\"" | tail -1
agent-browser screenshot /tmp/v8-browse.png 2>&1 | grep -v "node\|libc\|0x" | tail -1

# subscribe to Announcements
echo "=== Subscribe to Announcements ==="
agent-browser eval "(()=>{const d=document.querySelector('[role=dialog]');if(!d)return 'no dialog';const b=[...d.querySelectorAll('button')].find(b=>/announcements/i.test(b.innerText));if(b){b.click();return 'subscribed';}return 'no btn';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 3

echo "=== After subscribe: channel in sidebar? ==="
agent-browser eval "(()=>{const aside=document.querySelector('aside');if(!aside)return 'no aside';const txt=aside.innerText;return JSON.stringify({hasAnnouncements:/announcements/i.test(txt),hasBrowse:/browse channels|смотреть каналы/i.test(txt)});})()" 2>&1 | grep -E "^\{|^\"" | tail -1

# open Announcements, send a message, react
echo "=== Open Announcements channel ==="
agent-browser eval "(()=>{const b=[...document.querySelectorAll('aside button')].find(b=>/^announcements\$/i.test(b.innerText.trim().split(/\\s+/)[0]));if(b){b.click();return 'opened';}return 'no';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 2

echo "=== Send a test message ==="
agent-browser fill "textarea" "Test message for reactions" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser eval "(()=>{const ta=document.querySelector('textarea');if(!ta)return 'no ta';const ev=new KeyboardEvent('keydown',{key:'Enter',bubbles:true});ta.dispatchEvent(ev);return 'sent';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 3

echo "=== Reactions bar visible? ==="
agent-browser eval "(()=>{const main=document.querySelector('main');if(!main)return 'no main';const txt=main.innerText;const hasReact=/react|отреагировать/i.test(txt);const hasEmojiBtn=document.querySelector('button[aria-label]')?true:false;return JSON.stringify({hasReactText:hasReact,sample:txt.slice(-200)});})()" 2>&1 | grep -E "^\{|^\"" | tail -1
agent-browser screenshot /tmp/v8-reactions.png 2>&1 | grep -v "node\|libc\|0x" | tail -1

# click reaction picker (smile plus button)
echo "=== Open reaction picker ==="
agent-browser eval "(()=>{const b=[...document.querySelectorAll('main button')].find(b=>{const a=b.getAttribute('aria-label')||'';return /add reaction|добавить реакцию/i.test(a);});if(b){b.click();return 'opened picker';}return 'no react btn';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 1
echo "=== Pick thumbs up ==="
agent-browser eval "(()=>{const btns=[...document.querySelectorAll('main button')];const up=btns.find(b=>b.innerText.trim()==='👍');if(up){up.click();return 'reacted';}return 'no emoji, btns:'+btns.filter(b=>/👍|❤️|😂/.test(b.innerText)).map(b=>b.innerText).join('|');})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 2
echo "=== Reaction shown? ==="
agent-browser eval "(()=>{const main=document.querySelector('main');if(!main)return 'no main';return JSON.stringify({hasThumbs:/👍/.test(main.innerText),sample:main.innerText.slice(-150)});})()" 2>&1 | grep -E "^\{|^\"" | tail -1
agent-browser screenshot /tmp/v8-reaction-added.png 2>&1 | grep -v "node\|libc\|0x" | tail -1

kill $SRV 2>/dev/null
echo "done"
