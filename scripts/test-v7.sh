#!/usr/bin/env bash
# Test: new user sees no rooms, action bar visible; dev user sees channels + browse button
set -u
cd /home/z/my-project
mkdir -p /tmp/holler-serve
ln -sfn /home/z/my-project/out /tmp/holler-serve/holler
python3 -m http.server 8088 --directory /tmp/holler-serve > /tmp/holler-static.log 2>&1 &
SRV=$!
sleep 1.5
export AGENT_BROWSER_SESSION="holler-test-v7"

# --- Test 1: new user (fresh signup, no rooms) ---
TS=$(date +%s)
EMAIL="emptytest_${TS}@holler-test.example"
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 2
agent-browser eval "(()=>{try{localStorage.clear()}catch(e){}return 'cleared';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 2
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^Sign up\$/.test(b.innerText.trim()));if(b){b.click();return 'tab';}return 'no';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 1
agent-browser fill "#name" "Empty Test" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser fill "#email" "$EMAIL" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser fill "#password" "TestPassword123!" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser fill "#secret-q" "Pet?" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser fill "#secret-a" "Cat" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.className.includes('w-full')&&/create account/i.test(b.innerText.trim()));if(b){b.click();return 'submit';}return 'no';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 7
echo "=== NEW USER (no rooms) ==="
agent-browser eval "(()=>{const aside=document.querySelector('aside');if(!aside)return JSON.stringify({error:'no aside',title:document.title});const txt=aside.innerText;return JSON.stringify({hasChannels:/CHANNELS/im.test(txt),hasGroups:/GROUPS|ГРУППЫ/im.test(txt),hasDirect:/DIRECT|ПРЯМЫЕ/im.test(txt),hasAddRoom:/add a room|добавить комнату/i.test(txt),hasBrowse:/browse channels|смотреть каналы/i.test(txt),hasDevChannel:/Dev Channel/i.test(txt),hasNoChannelsMsg:/no channels yet|каналов пока нет/i.test(txt)});})()" 2>&1 | grep -E "^\{|^\"" | tail -1
agent-browser screenshot /tmp/v7-new-user.png 2>&1 | grep -v "node\|libc\|0x" | tail -1

# --- Test 2: dev user (has Dev Channel) ---
agent-browser eval "(()=>{try{localStorage.clear()}catch(e){}return 'cleared';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 2
agent-browser fill "input[type='email']" "resptest_1793453864@holler-test.example" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser fill "input[type='password']" "TestPassword123!" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser eval "(()=>{const si=[...document.querySelectorAll('button')].find(b=>b.className.includes('w-full')&&/sign in/i.test(b.innerText.trim()));if(si){si.click();return 'ok';}return 'no';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 6
echo "=== DEV USER (has Dev Channel + joinable) ==="
agent-browser eval "(()=>{const aside=document.querySelector('aside');if(!aside)return 'no aside';const txt=aside.innerText;return JSON.stringify({hasChannels:/CHANNELS|КАНАЛЫ/im.test(txt),hasGroups:/GROUPS|ГРУППЫ/im.test(txt),hasDirect:/DIRECT|ПРЯМЫЕ/im.test(txt),hasAddRoom:/add a room|добавить комнату/i.test(txt),hasBrowse:/browse channels|смотреть каналы/i.test(txt),hasDevChannel:/Dev Channel/i.test(txt)});})()" 2>&1 | grep -E "^\{|^\"" | tail -1
agent-browser screenshot /tmp/v7-dev-user.png 2>&1 | grep -v "node\|libc\|0x" | tail -1

kill $SRV 2>/dev/null
echo "done; new_email=$EMAIL"
