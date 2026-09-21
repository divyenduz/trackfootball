#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dev_vars="$repo_root/packages/rw-app/.dev.vars"
tmp_vars="$dev_vars.tmp.$$"

required=(
  DATABASE_URL
  STRAVA_CLIENT_ID
  STRAVA_CLIENT_SECRET
  BETTER_AUTH_SECRET
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  PUBLIC_URL
)

for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required orb environment variable: %s\n' "$name" >&2
    exit 1
  fi
done

export BACKEND_API="$PUBLIC_URL/api"
export BETTER_AUTH_URL="$PUBLIC_URL"
export HOMEPAGE_URL="$PUBLIC_URL"

write_var() {
  local name="$1"
  local value="${!name:-}"
  value="${value//\/\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  printf '%s="%s"\n' "$name" "$value"
}

trap 'rm -f "$tmp_vars"' EXIT
umask 077
{
  for name in \
    BACKEND_API \
    DATABASE_URL \
    STRAVA_CLIENT_ID \
    STRAVA_CLIENT_SECRET \
    HOMEPAGE_URL \
    UNSAFE_AUTH_BYPASS_USER \
    STRAVA_WEBHOOK_VERIFY_TOKEN \
    BETTER_AUTH_URL \
    BETTER_AUTH_SECRET \
    GOOGLE_CLIENT_ID \
    GOOGLE_CLIENT_SECRET \
    DISCORD_TRACKFOOTBALL_APPLICATION_EVENTS_WEBHOOK; do
    write_var "$name"
  done
} > "$tmp_vars"
mv "$tmp_vars" "$dev_vars"
trap - EXIT

cd "$repo_root/packages/rw-app"
exec pnpm run dev "$@"
