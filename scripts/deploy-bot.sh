#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROD_ROOT_DIR="${PROD_ROOT_DIR:-/opt/homeserver-gameserver-1}"
PROD_BOT_ENV_FILE="${PROD_ROOT_DIR}/config/bot.env"
PROD_DATA_DIR="${PROD_ROOT_DIR}/data"

BOT_ENV_FILE="${BOT_ENV_FILE:-${ROOT_DIR}/config/bot.env}"
DATA_DIR="${DATA_DIR:-${ROOT_DIR}/data}"

if [[ "${ALLOW_NON_PROD_DEPLOY:-false}" != "true" ]]; then
  if [[ "$ROOT_DIR" != "$PROD_ROOT_DIR" ]]; then
    echo "Refusing deploy outside production checkout." >&2
    echo "ROOT_DIR=$ROOT_DIR" >&2
    echo "Expected: $PROD_ROOT_DIR" >&2
    echo "Set ALLOW_NON_PROD_DEPLOY=true only for intentional non-production deploys." >&2
    exit 1
  fi

  if [[ "$BOT_ENV_FILE" != "$PROD_BOT_ENV_FILE" ]]; then
    echo "Refusing deploy with unexpected BOT_ENV_FILE." >&2
    echo "BOT_ENV_FILE=$BOT_ENV_FILE" >&2
    echo "Expected: $PROD_BOT_ENV_FILE" >&2
    echo "Set ALLOW_NON_PROD_DEPLOY=true only for intentional non-production deploys." >&2
    exit 1
  fi

  if [[ "$DATA_DIR" != "$PROD_DATA_DIR" ]]; then
    echo "Refusing deploy with unexpected DATA_DIR." >&2
    echo "DATA_DIR=$DATA_DIR" >&2
    echo "Expected: $PROD_DATA_DIR" >&2
    echo "Set ALLOW_NON_PROD_DEPLOY=true only for intentional non-production deploys." >&2
    exit 1
  fi
fi

if [[ ! -f "$BOT_ENV_FILE" ]]; then
  echo "BOT_ENV_FILE not found: $BOT_ENV_FILE" >&2
  exit 1
fi

export BOT_ENV_FILE
export DATA_DIR

docker compose -f infra/compose.bot.yaml up -d --build

# Register slash commands (guild commands). Safe to run on every deploy.
docker compose -f infra/compose.bot.yaml run --rm bot node dist/scripts/register-commands.js

docker compose -f infra/compose.bot.yaml ps
