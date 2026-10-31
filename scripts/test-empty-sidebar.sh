#!/usr/bin/env bash
# Test: sidebar hides empty GROUPS/CHANNELS, shows "Add a room" action bar
set -u
cd /home/z/my-project
mkdir -p /tmp/holler-serve
ln -sfn /home/z/my-project/out /tmp/holler-serve/holler

python3 -m http.server 8088 --directory /tmp/holler-serve > /tmp/holler-static.log 2>&1 &
SRV_PID=$!
sleep 1.5

export AGENT_BROWSER_SESSION="holler-test-v6"
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | tail -1
sleep 3

# create a fresh test user with NO rooms
TS=$(date +%s)
EMAIL="emptytest_${TS}@holler-test.example"
agent-browser eval "(()=>{localStorage.clear();return 'cleared';})()" 2>&1 | tail -1
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | tail -1
sleep 2

# switch to signup tab
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^Sign up\$/.test(b.innerText.trim()));if(b){b.click();return 'ok';}return 'no';})()" 2>&1 | tail -1
sleep 1

# fill signup form
agent-browser fill "#name" "Empty Test" 2>&1 | tail -1
agent-browser fill "#email" "$EMAIL" 2>&1 | tail -1
agent-browser fill "#password" "TestPassword123!" 2>&1 | tail -1
agent-browser fill "#secret-q" "Pet?" 2>&1 | tail -1
agent-browser fill "#secret-a" "Cat" 2>&1 | tail -1

# submit
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.className.includes('w-full')&&/create account/i.test(b.innerText.trim()));if(b){b.click();return 'submit';}return 'no';})()" 2>&1 | tail -1
sleep 6

echo "=== After signup: app loaded? ==="
agent-browser eval "(()=>{const aside=document.querySelector('aside');return JSON.stringify({hasAside:!!aside,title:document.title});})()" 2>&1 | tail -1

echo "=== Sidebar content (sections visible?) ==="
agent-browser eval "(()=>{const aside=document.querySelector('aside');if(!aside)return 'no aside';const txt=aside.innerText;return JSON.stringify({hasDirect:/^DIRECT|ПРЯМЫЕ|DIRECTOS|DIRECTE/im.test(txt),hasGroups:/^GROUPS|ГРУППЫ|GRUPOS|GRUPPEN/im.test(txt),hasChannels:/^CHANNELS|КАНАЛЫ|CANALES|KANÄLE/im.test(txt),hasAddRoom:/add a room|добавить комнату|añadir una sala|raum hinzufügen/i.test(txt),hasNoChannelsMsg:/no channels yet|каналов пока нет/i.test(txt),hasNoGroupsMsg:/no groups yet|групп пока нет/i.test(txt),sample:txt.slice(0,300)});})()" 2>&1 | tail -2

agent-browser screenshot /tmp/v6-empty-sidebar.png 2>&1 | tail -1

# also test the existing dev user (has Dev Channel) — sections should show
agent-browser eval "(()=>{localStorage.clear();return 'cleared';})()" 2>&1 | tail -1
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | tail -1
sleep 2
agent-browser fill "input[type='email']" "resptest_1793453864@holler-test.example" 2>&1 | tail -1
agent-browser fill "input[type='password']" "TestPassword123!" 2>&1 | tail -1
agent-browser eval "(()=>{const si=[...document.querySelectorAll('button')].find(b=>b.className.includes('w-full')&&/sign in/i.test(b.innerText.trim()));if(si){si.click();return 'ok';}return 'no';})()" 2>&1 | tail -1
sleep 6

echo "=== Dev user sidebar (has Dev Channel) ==="
agent-browser eval "(()=>{const aside=document.querySelector('aside');if(!aside)return 'no aside';const txt=aside.innerText;return JSON.stringify({hasChannels:/^CHANNELS|КАНАЛЫ/im.test(txt),hasAddRoom:/add a room|добавить комнату/i.test(txt),hasDevChannel:/Dev Channel/i.test(txt),sample:txt.slice(0,250)});})()" 2>&1 | tail -2

kill $SRV_PID 2>/dev/null
echo "done"
