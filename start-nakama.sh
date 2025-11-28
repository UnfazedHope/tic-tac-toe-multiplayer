#!/bin/sh
set -e

echo "Starting Nakama migration..."
/nakama/nakama migrate up --database.address "$DATABASE_URL"

echo "Starting Nakama server..."
exec /nakama/nakama \
  --name nakama1 \
  --database.address "$DATABASE_URL" \
  --logger.level INFO \
  --session.token_expiry_sec 7200 \
  --socket.server_key defaultkey \
  --socket.port 7350
