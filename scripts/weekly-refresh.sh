#!/bin/zsh
# Weekly timetable refresh, started by launchd from
# ~/Library/LaunchAgents/in.shivrajsinh.stopwatch-refresh.plist (Mondays 04:00; if the Mac is
# asleep then, launchd runs it once when it next wakes).
#
#   download feeds -> rebuild data -> share images -> build, check and deploy each shard -> IndexNow
#
# A macOS notification says how it went; the full log is in data/logs/.
# `scripts/weekly-refresh.sh --check` only checks that everything it needs is in place.
set -u
cd "$HOME/transit-timetables" || exit 1
# launchd starts with a bare PATH: use fnm's default Node, as the interactive shell does.
export PATH="$HOME/.local/share/fnm/aliases/default/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p data/logs
LOG="data/logs/refresh-$(date +%Y-%m-%d).log"

notify() { osascript -e "display notification \"$2\" with title \"Stopwatch refresh\" subtitle \"$1\"" >/dev/null 2>&1 || true; }

# The build needs ~1.5 GB per shard while it works and the new feeds and data on top.
free_gb=$(df -k . | awk 'NR==2 {print int($4 / 1048576)}')
if [ "$free_gb" -lt 3 ]; then
  echo "$(date): skipped, only ${free_gb} GB free" >> "$LOG"
  notify "Skipped: disk almost full" "Only ${free_gb} GB free; the refresh needs 3 GB."
  exit 1
fi

if [ "${1:-}" = "--check" ]; then
  echo "node $(node -v), npm $(npm -v), disk ${free_gb} GB free"
  if npx --no-install wrangler whoami 2>&1 | grep -qi "not authenticated"; then echo "wrangler: NOT signed in"; exit 1; fi
  echo "wrangler: signed in"
  exit 0
fi

start=$(date +%s)
echo "=== $(date) refresh started" >> "$LOG"
# caffeinate: an idle Mac must not fall asleep halfway through a deploy.
if caffeinate -i npm run refresh >> "$LOG" 2>&1; then
  mins=$(( ($(date +%s) - start) / 60 ))
  echo "=== $(date) done in ${mins} min" >> "$LOG"
  notify "Done" "Every timetable rebuilt and deployed in ${mins} min."
else
  echo "=== $(date) FAILED" >> "$LOG"
  notify "Failed" "The site still serves last week's timetables. Log: data/logs/$(basename "$LOG")"
  exit 1
fi

# Keep the last eight weeks of logs.
/bin/ls -1t data/logs/refresh-*.log 2>/dev/null | tail -n +9 | xargs rm -f
