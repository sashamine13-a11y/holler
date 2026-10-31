#!/usr/bin/env bash
# Test dev user sidebar (has Dev Channel)
set -u
cd /home/z/my-project
mkdir -p /tmp/holler-serve
ln -sfn /home/z/my-project/out /tmp/holler-serve/holler
python3 -m http.server 8088 --directory /tmp/holler-serve > /tmp/holler-static.log 2>&1 &
SRV=$!
sleep 1.5
export AGENT_BROWSER_SESSION="holler-test-v6c"
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 3
agent-browser fill "input[type='email']" "resptest_1793453864@holler-test.example" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser fill "input[type='password']" "TestPassword123!" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser eval "(()=>{const si=[...document.querySelectorAll('button')].find(b=>b.className.includes('w-full')&&/sign in/i.test(b.innerText.trim()));if(si){si.click();return 'ok';}return 'no';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 6
echo "=== Dev user sidebar (has Dev Channel) ==="
agent-browser eval "(()=>{const aside=document.querySelector('aside');if(!aside)return 'no aside';const txt=aside.innerText;return JSON.stringify({hasChannels:/CHANNELS/im.test(txt),hasGroups:/GROUPS|ГРУППЫ/im.test(txt),hasDirect:/DIRECT|ПРЯМЫЕ/im.test(txt),hasAddRoom:/add a room|добавить комнату/i.test(txt),hasDevChannel:/Dev Channel/i.test(txt),hasNoChannelsMsg:/no channels yet|каналов пока нет/i.test(txt),hasNoGroupsMsg:/no groups yet|групп пока нет/i.test(txt)});})()" 2>&1 | grep -E "^\{|^\"" | tail -1
agent-browser screenshot /tmp/v6-dev-sidebar.png 2>&1 | grep -v "node\|libc\|0x" | tail -1
kill $SRV 2>/dev/null
echo "done"
