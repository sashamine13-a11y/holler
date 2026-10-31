#!/usr/bin/env bash
# Scroll settings modal to bottom, screenshot dev panel
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

# already logged in from prior session (localStorage). Open settings:
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>{const a=b.getAttribute('aria-label');return a&&/settings|настройки/i.test(a);}); if(b){b.click();return 'clicked';} return 'not found'; })()" 2>&1 | tail -1
sleep 2

# scroll the modal content to bottom
agent-browser eval "(() => { const sc=document.querySelector('[role=dialog] [class*=overflow-y-auto], [role=dialog] .scroll-thin, [role=dialog] > div > div'); if(sc){sc.scrollTop=sc.scrollHeight; return 'scrolled '+sc.scrollHeight;} return 'no scroll container'; })()" 2>&1 | tail -1
sleep 1
agent-browser screenshot /tmp/v4-devpanel-full.png 2>&1 | tail -1

# crop bottom 40%
python3 -c "
from PIL import Image
im=Image.open('/tmp/v4-devpanel-full.png')
w,h=im.size
im.crop((0,int(h*0.55),w,h)).save('/tmp/v4-devpanel-crop.png')
print('cropped')
"

kill $SRV_PID 2>/dev/null
echo "done"
