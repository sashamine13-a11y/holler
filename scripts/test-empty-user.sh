#!/usr/bin/env bash
# Test brand-new user: no rooms → empty GROUPS/CHANNELS hidden, "Add a room" bar shown
set -u
cd /home/z/my-project
mkdir -p /tmp/holler-serve
ln -sfn /home/z/my-project/out /tmp/holler-serve/holler
python3 -m http.server 8088 --directory /tmp/holler-serve > /tmp/holler-static.log 2>&1 &
SRV=$!
sleep 1.5
export AGENT_BROWSER_SESSION="holler-test-v6d"
TS=$(date +%s)
EMAIL="emptytest_${TS}@holler-test.example"
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 2
# clear any session
agent-browser eval "(()=>{try{localStorage.clear()}catch(e){}return 'cleared';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 2
# signup tab
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^Sign up\$/.test(b.innerText.trim()));if(b){b.click();return 'tab';}return 'no';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 1
# fill
agent-browser fill "#name" "Empty Test" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser fill "#email" "$EMAIL" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser fill "#password" "TestPassword123!" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser fill "#secret-q" "Pet?" 2>&1 | grep -v "node\|libc\|0x" | tail -1
agent-browser fill "#secret-a" "Cat" 2>&1 | grep -v "node\|libc\|0x" | tail -1
# submit
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.className.includes('w-full')&&/create account/i.test(b.innerText.trim()));if(b){b.click();return 'submit';}return 'no';})()" 2>&1 | grep -v "node\|libc\|0x" | tail -1
sleep 7
echo "=== After signup ==="
agent-browser eval "(()=>{const aside=document.querySelector('aside');if(!aside)return JSON.stringify({error:'no aside',title:document.title});const txt=aside.innerText;return JSON.stringify({hasChannels:/CHANNELS/im.test(txt),hasGroups:/GROUPS|ГРУППЫ/im.test(txt),hasDirect:/DIRECT|ПРЯМЫЕ/im.test(txt),hasAddRoom:/add a room|добавить комнату/i.test(txt),hasCreateChannel:/New channel|Новый канал/i.test(txt),hasCreateGroup:/New group|Новая группа/i.test(txt),hasNoChannelsMsg:/no channels yet|каналов пока нет/i.test(txt),hasNoGroupsMsg:/no groups yet|групп пока нет/i.test(txt)});})()" 2>&1 | grep -E "^\{|^\"" | tail -1
agent-browser screenshot /tmp/v6-empty-sidebar.png 2>&1 | grep -v "node\|libc\|0x" | tail -1
kill $SRV 2>/dev/null
echo "done; email=$EMAIL"
