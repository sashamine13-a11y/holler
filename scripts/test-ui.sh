#!/usr/bin/env bash
# Serve out/ statically and run agent-browser tests in one shot.
set -u
cd /home/z/my-project
mkdir -p /tmp/holler-serve
ln -sfn /home/z/my-project/out /tmp/holler-serve/holler

# start static server
python3 -m http.server 8088 --directory /tmp/holler-serve > /tmp/holler-static.log 2>&1 &
SRV_PID=$!
sleep 1.5
code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/holler/)
echo "server http=$code pid=$SRV_PID"

export AGENT_BROWSER_SESSION="holler-test-v4"

run() {
  echo "=== $* ==="
  agent-browser "$@" 2>&1 | tail -45
  echo
}

# open app
agent-browser open "http://localhost:8088/holler/" --viewport 390x844 2>&1 | tail -2
sleep 2

# screenshot auth screen
agent-browser screenshot /tmp/auth.png 2>&1 | tail -1

# snapshot interactive
agent-browser snapshot -i 2>&1 | head -60

# kill server
kill $SRV_PID 2>/dev/null
echo "server killed"
