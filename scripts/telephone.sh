#!/usr/bin/env bash
# Ouvre l'application mobile sur un vrai téléphone (iPhone ou Android) avec Expo Go.
#
# Le téléphone et l'ordinateur doivent être sur le même Wi-Fi. Le script trouve l'adresse de
# l'ordinateur sur ce réseau, y expose l'API (port 8000) et lance Expo : il reste à scanner le
# QR code affiché avec l'appareil photo de l'iPhone (ou l'application Expo Go sur Android).
# Ctrl+C arrête Expo et le serveur. Développement et démonstration seulement, jamais en production.
set -euo pipefail
cd "$(dirname "$0")/.."

ip="${INNOV_IP:-}"
if [ -z "$ip" ]; then
  if command -v ipconfig >/dev/null 2>&1 && [ "$(uname)" = "Darwin" ]; then
    ip="$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || true)"
  else
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
fi
if [ -z "$ip" ]; then
  echo "Adresse locale introuvable : relancer avec INNOV_IP=192.168.x.x make telephone" >&2
  exit 1
fi

echo "API sur http://$ip:8000 ; ouvrir le QR code ci-dessous avec l'appareil photo de l'iPhone."
(
  cd backend
  DJANGO_ALLOWED_HOSTS="localhost,127.0.0.1,$ip" .venv/bin/python manage.py runserver "0.0.0.0:8000"
) &
serveur=$!
trap 'kill "$serveur" 2>/dev/null || true' EXIT

EXPO_PUBLIC_API_URL="http://$ip:8000" npm run start -w mobile -- --lan
