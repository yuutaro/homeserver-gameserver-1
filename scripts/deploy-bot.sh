#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BOT_ENV_FILE="${BOT_ENV_FILE:-/etc/homeserver-gameserver/bot.env}"

if [[ ! -f "$BOT_ENV_FILE" ]]; then
  echo "BOT_ENV_FILE not found: $BOT_ENV_FILE" >&2
  exit 1
fi

export BOT_ENV_FILE

docker compose -f infra/compose.bot.yaml up -d --build

# Register slash commands (guild commands). Safe to run on every deploy.
docker compose -f infra/compose.bot.yaml run --rm bot node dist/scripts/register-commands.js

docker compose -f infra/compose.bot.yaml ps

