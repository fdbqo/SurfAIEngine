#!/usr/bin/env bash
# Vercel Hobby: built-in crons are limited to ONCE PER DAY. vercel.json uses a daily schedule.
# For hourly (or more frequent) runs without Pro, trigger this URL from:
#   - GitHub Actions `on: schedule` (see .github/workflows example you can add)
#   - https://cron-job.org (free HTTP ping)
#   - your own server crontab
#
# Usage (set env or replace inline):
#   export CRON_SECRET=... APP_URL=https://your-app.vercel.app
#   bash scripts/trigger-cron-notify.example.sh

set -euo pipefail
: "${CRON_SECRET:?Set CRON_SECRET}"
: "${APP_URL:?Set APP_URL (e.g. https://xxx.vercel.app)}"

curl -sS -f \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/cron/notify"
